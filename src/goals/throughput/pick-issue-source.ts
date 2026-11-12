import { isZSession } from '../../linear/is-z-session.ts';
import { getDeclaredForwards } from '../../roles/get-declared-forwards.ts';
import type { IssueSource } from './types.ts';

const OLD_SOURCES = ['owner', 'design', 'agent', 'live check', 'bot'] as const;

export function pickIssueSource(stored: string, isRecorded: boolean, sessions: readonly string[]): IssueSource {
  if (isRecorded) {
    return 'review';
  }
  const old = OLD_SOURCES.find((source) => source === stored);
  if (old !== undefined) {
    return old;
  }
  const current = getDeclaredForwards()[stored] ?? stored;
  return isZSession(current, sessions) ? current : 'agent';
}
