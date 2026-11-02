import type { ReadyIssue } from '../src/lanes/types.ts';

export function buildReadyIssue(identifier: string, over: Partial<ReadyIssue> = {}): ReadyIssue {
  return { identifier, project: null, projectLabels: [], labels: [], type: 'none', priority: 0, createdAt: '2026-10-01T00:00:00.000Z', parent: null, ...over };
}
