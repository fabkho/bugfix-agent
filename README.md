# bugfix-agent

Multi-repo bugfix agent for [pi](https://github.com/badlogic/pi-mono). Fetches issues from trackers (ClickUp, GitHub Issues, etc.), analyzes codebases across multiple repositories, fixes bugs, and creates merge requests.

## Status

🚧 Under development

## Features (planned)

- **Multi-repo**: Works across multiple repositories in a single session
- **Issue tracker adapters**: ClickUp, GitHub Issues, headless (free-text)
- **Workspace management**: Auto-creates git worktree workspaces per bug
- **MR/PR creation**: Pushes fixes and opens merge requests via `glab`/`gh`
- **Scout subagents**: Delegates research to cheap, fast subagents to keep context lean
- **Project configs**: YAML-based per-project configuration for reuse

## Setup

```bash
# Clone
git clone git@github.com:fabkho/bugfix-agent.git ~/code/bugfix-agent
cd ~/code/bugfix-agent
npm install

# Add to pi settings.json
# "extensions": ["~/code/bugfix-agent/extension/index.ts"]

# Create project config
cp configs/example.yaml ~/.config/bugfix-agent/my-project.yaml
# Edit with your repos, paths, tokens
```

## Usage

Inside pi:
```
/bugfix CU-12345
/bugfix CU-12345 repo=frontend "The modal crashes on save"
/bugfix "The booking endpoint returns 500 for large payloads"
```

## License

MIT
