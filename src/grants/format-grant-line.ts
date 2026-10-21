import type { GrantTally } from './types.ts';

// One grant on one line: its name, mark and count, then each target and who acted.
export function formatGrantLine(t: GrantTally): string {
  const actions = t.actions.length === 0 ? 'none' : `${t.actions.length}: ${t.actions.map((a) => `${a.target} (${a.actor})`).join('; ')}`;
  return `${t.grant} (mark ${t.mark}${t.ref === null ? '' : `, ${t.ref}`}): ${actions}`;
}
