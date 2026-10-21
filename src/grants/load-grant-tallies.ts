import type { Database } from 'bun:sqlite';
import type { GrantAction, GrantTally, GrantWindow } from './types.ts';

// Every named grant, by name, with the actions taken under it in the window. A grant with none is
// listed too: an unused grant is the plainest one for the owner to pull back.
export function loadGrantTallies(db: Database, window: GrantWindow): GrantTally[] {
  const actionsOf = db.query('SELECT * FROM grant_actions WHERE grant_name = ? AND at >= ? AND at < ? ORDER BY id'),
    marks = db.query('SELECT id, grant_name, text, ref FROM marks WHERE grant_name IS NOT NULL ORDER BY grant_name').all() as { id: number; grant_name: string; text: string; ref: string | null }[];
  return marks.map((m) => ({ grant: m.grant_name, mark: m.id, text: m.text, ref: m.ref, actions: actionsOf.all(m.grant_name, window.from, window.to) as GrantAction[] }));
}
