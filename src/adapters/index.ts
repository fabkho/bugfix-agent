import type { IssueAdapter } from './types.js'
import type { IssueTrackerConfig } from '../config.js'
import { ClickUpAdapter } from './clickup.js'
import { HeadlessAdapter } from './headless.js'

export { type Task, type IssueAdapter } from './types.js'
export { ClickUpAdapter } from './clickup.js'
export { HeadlessAdapter } from './headless.js'

/**
 * Create an issue adapter from the tracker config.
 * Reads adapter-specific settings from the nested sub-object.
 */
export function createAdapter(trackerConfig: IssueTrackerConfig): IssueAdapter {
  switch (trackerConfig.type) {
    case 'clickup': {
      const clickupConfig = (trackerConfig as any).clickup as { tokenEnv?: string } | undefined
      return new ClickUpAdapter(clickupConfig?.tokenEnv)
    }
    case 'headless':
      return new HeadlessAdapter()
    default:
      throw new Error(
        `Unknown issue tracker type: "${trackerConfig.type}". Supported: clickup, headless`,
      )
  }
}
