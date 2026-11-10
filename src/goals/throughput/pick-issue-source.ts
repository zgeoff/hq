import type { IssueSource } from './types.ts';

export function pickIssueSource(stored: string, isRecorded: boolean, sessions: readonly string[]): IssueSource {
  if (isRecorded) {
    return 'review';
  }
  return new Set(['owner', 'design', 'agent', 'live check', 'bot', ...sessions]).has(stored) ? stored : 'agent';
}
