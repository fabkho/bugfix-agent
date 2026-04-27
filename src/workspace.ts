import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ResolvedConfig } from "./config.js";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Convert arbitrary text into a URL/branch-friendly slug.
 * Lowercase, hyphens only, no leading/trailing hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a branch slug following the `fix/` convention.
 *
 * - With taskId:  `fix/<taskId>_<slugified-title>`
 * - Without:      `fix/<slugified-title>`  (falls back to timestamp)
 */
export function buildBranchSlug(taskId?: string, title?: string): string {
  if (taskId) {
    const slug = slugify(title || "bugfix");
    return `fix/${taskId}_${slug}`;
  }
  const slug = slugify(title || `bugfix-${Date.now()}`);
  return `fix/${slug}`;
}

// ── Workspace detection ──────────────────────────────────────────────

/**
 * Check whether a fully-formed workspace already exists for `branchSlug`.
 * Returns a repo-name → absolute-path map when **every** repo directory
 * exists, or `null` when the workspace is missing / partial.
 */
export function detectExistingWorkspace(
  config: ResolvedConfig,
  branchSlug: string,
): Record<string, string> | null {
  const slug = branchSlug.replace(/^fix\//, "");
  const sessionDir = path.resolve(config.workspace.root, slug);
  const paths: Record<string, string> = {};

  for (const [repoKey, repo] of Object.entries(config.repos)) {
    const repoName = repo.name ?? repoKey;
    const worktreePath = path.join(sessionDir, repoName);

    if (!fs.existsSync(worktreePath)) {
      return null;
    }

    // Verify git actually knows about this worktree
    try {
      const list = execSync("git worktree list --porcelain", {
        cwd: repo.path,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      });
      if (!list.includes(`worktree ${worktreePath}`)) {
        return null;
      }
    } catch {
      return null;
    }

    paths[repoName] = worktreePath;
  }

  return Object.keys(paths).length > 0 ? paths : null;
}

// ── Workspace creation ───────────────────────────────────────────────

/**
 * Create (or re-use) an isolated worktree workspace for a bugfix session.
 *
 * Two modes:
 * 1. **Custom script** – delegates to `config.workspace.script` with the
 *    branch slug as the sole argument. The script is expected to create
 *    worktree directories at `<workspace_root>/<slug>/<repoName>/`.
 * 2. **Generic fallback** – runs `git worktree add` for every repo in
 *    the config.
 *
 * Returns `Record<repoName, absoluteWorktreePath>`.
 */
export async function createWorkspace(
  config: ResolvedConfig,
  taskId?: string,
  title?: string,
): Promise<Record<string, string>> {
  const branchSlug = buildBranchSlug(taskId, title);
  const slug = branchSlug.replace(/^fix\//, "");

  // ── Check for existing workspace first ──────────────────────────
  const existing = detectExistingWorkspace(config, branchSlug);
  if (existing) {
    return existing;
  }

  // ── Mode 1: custom script ───────────────────────────────────────
  if (config.workspace.script) {
    const script = config.workspace.script;

    if (!fs.existsSync(script)) {
      throw new Error(
        `Workspace script not found: ${script}`,
      );
    }

    try {
      execSync(`${script} ${slug}`, {
        cwd: config.workspace.root,
        stdio: "pipe",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      throw new Error(
        `Workspace script failed (${script} ${slug}): ${msg}`,
      );
    }

    // Derive paths from convention: <root>/<slug>/<repoName>/
    const paths: Record<string, string> = {};
    for (const [repoKey, repo] of Object.entries(config.repos)) {
      const repoName = repo.name ?? repoKey;
      const worktreePath = path.resolve(
        config.workspace.root,
        slug,
        repoName,
      );
      paths[repoName] = worktreePath;
    }
    return paths;
  }

  // ── Mode 2: generic git-worktree fallback ───────────────────────
  const sessionDir = path.resolve(config.workspace.root, slug);
  fs.mkdirSync(sessionDir, { recursive: true });

  const paths: Record<string, string> = {};
  const created: Array<{ repo: string; worktreePath: string }> = [];

  try {
    for (const [repoKey, repo] of Object.entries(config.repos)) {
      const repoName = repo.name ?? repoKey;
      const worktreePath = path.join(sessionDir, repoName);

      // Skip if this individual worktree already exists and is registered
      if (fs.existsSync(worktreePath)) {
        try {
          const list = execSync("git worktree list --porcelain", {
            cwd: repo.path,
            stdio: ["pipe", "pipe", "pipe"],
            encoding: "utf-8",
          });
          if (list.includes(`worktree ${worktreePath}`)) {
            paths[repoName] = worktreePath;
            continue;
          }
        } catch {
          // If we can't verify, fall through and let git worktree add decide
        }
      }

      // Resolve base ref (local branch or remote tracking)
      const baseRef = resolveBaseRef(repo.path, repo.baseBranch);

      try {
        execSync(
          `git -C ${quote(repo.path)} worktree add -b ${quote(branchSlug)} ${quote(worktreePath)} ${quote(baseRef)}`,
          { stdio: "pipe" },
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to create worktree for "${repoName}" at ${worktreePath}: ${msg}`,
        );
      }

      created.push({ repo: repo.path, worktreePath });
      paths[repoName] = worktreePath;
    }
  } catch (err) {
    // Roll back any worktrees we already created in this run
    for (const { repo, worktreePath } of created) {
      try {
        execSync(
          `git -C ${quote(repo)} worktree remove -f ${quote(worktreePath)}`,
          { stdio: "pipe" },
        );
      } catch {
        // best-effort cleanup
      }
    }
    throw err;
  }

  return paths;
}

// ── Internal utilities ───────────────────────────────────────────────

/**
 * Resolve a base branch to a usable git ref.
 * Prefers the local branch; falls back to `origin/<branch>`.
 */
function resolveBaseRef(repoPath: string, branch: string): string {
  try {
    execSync(
      `git -C ${quote(repoPath)} show-ref --verify --quiet refs/heads/${branch}`,
      { stdio: "pipe" },
    );
    return branch;
  } catch {
    // local branch doesn't exist — try remote
  }

  try {
    execSync(
      `git -C ${quote(repoPath)} show-ref --verify --quiet refs/remotes/origin/${branch}`,
      { stdio: "pipe" },
    );
    return `origin/${branch}`;
  } catch {
    throw new Error(
      `Base branch "${branch}" not found in ${repoPath} (neither local nor origin/${branch})`,
    );
  }
}

/** Shell-quote a single argument. */
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
