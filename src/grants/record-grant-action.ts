import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import type { GrantAction, GrantActionInput } from './types.ts';

export function recordGrantAction(db: Database, input: GrantActionInput): GrantAction {
  const note = input.note === null || input.note.trim() === '' ? null : input.note.trim();
  const target = input.target.trim();
  if (target === '' || /[\r\n]/u.test(target)) {
    throw new HqError('bad_args', '--target must be one line: the issue, PR or command');
  }
  return db
    .transaction((): GrantAction => {
      requireNamedGrant(db, input.grant);
      const at = iso(now());
      const id = Number(db.query('INSERT INTO grant_actions (grant_name, target, note, actor, at) VALUES (?, ?, ?, ?, ?)').run(input.grant, target, note, input.actor, at).lastInsertRowid);
      logEvent(db, 'hq', `grant:${input.grant}`, 'grant-action', input.actor, null, null, { id, target, note });
      return { id, grant_name: input.grant, target, note, actor: input.actor, at };
    })
    .immediate();
}

const GrantNameSchema = z.object({ grant_name: z.string() });

function requireNamedGrant(db: Database, name: string): void {
  const query = kdb(db).selectFrom('marks').select('grant_name').where('grant_name', 'is not', null).orderBy('grant_name').compile();
  const names = runSyncQuery(db, query, GrantNameSchema).map((row) => row.grant_name);
  if (!names.includes(name)) {
    throw new HqError('not_found', `no grant named ${name}; named grants: ${names.length > 0 ? names.join(', ') : 'none (name one with hq mark grant ID NAME)'}`);
  }
}
