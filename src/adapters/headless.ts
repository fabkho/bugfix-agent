import type { Task, IssueAdapter } from './types.js'

export class HeadlessAdapter implements IssueAdapter {
  async fetchIssue(text: string): Promise<Task> {
    return {
      id: `headless-${Date.now()}`,
      title: text.slice(0, 80),
      description: text,
      comments: [],
      url: '',
      status: 'open',
      metadata: {},
    }
  }

  async addComment(id: string, comment: string): Promise<void> {
    console.log(`[headless] addComment(${id}): ${comment}`)
  }

  async updateStatus(id: string, status: string): Promise<void> {
    console.log(`[headless] updateStatus(${id}): ${status}`)
  }
}
