import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { GrantAction, GrantActionInput } from './types.ts';

// Appends one action a session took under a named standing grant. A name no grant mark carries is
// refused, with the names that exist, so a typo never files an action under no grant.
export function recordGrantAction(db: Database, input: GrantActionInput): GrantAction {
  const note = input.note === null || input.note.trim() === '' ? null : input.note.trim(),
    target = input.target.trim();
  if (target === '' || /[\r\n]/u.test(target)) {
    throw new HqError('bad_args', '--target must be one line: the issue, PR or command');
  }
  return db
    .transaction((): GrantAction => {
      requireNamedGrant(db, input.grant);
      const at = iso(now()),
        id = Number(db.query('INSERT INTO grant_actions (grant_name, target, note, actor, at) VALUES (?, ?, ?, ?, ?)').run(input.grant, target, note, input.actor, at).lastInsertRowid);
      logEvent(db, 'hq', `grant:${input.grant}`, 'grant-action', input.actor, null, null, { id, target, note });
      return { id, grant_name: input.grant, target, note, actor: input.actor, at };
    })
    .immediate();
}

function requireNamedGrant(db: Database, name: string): void {
  const names = (db.query('SELECT grant_name FROM marks WHERE grant_name IS NOT NULL ORDER BY grant_name').all() as { grant_name: string }[]).map((r) => r.grant_name);
  if (!names.includes(name)) {
    throw new HqError('not_found', `no grant named ${name}; named grants: ${names.length > 0 ? names.join(', ') : 'none (name one with hq mark grant ID NAME)'}`);
  }
}
