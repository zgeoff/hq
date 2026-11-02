import type { RefusalRow } from './types.ts';

export function formatWho(r: RefusalRow): string {
  return r.atc_name ?? (r.claude_session ? r.claude_session.slice(0, 8) : '?');
}
