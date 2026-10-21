import type { RefusalRow } from './types.ts';

// The session a refusal came from: its atc name, else its Claude session's first 8 characters.
export function formatWho(r: RefusalRow): string {
  return r.atc_name ?? (r.claude_session ? r.claude_session.slice(0, 8) : '?');
}
