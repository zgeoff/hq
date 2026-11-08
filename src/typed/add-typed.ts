import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import invariant from 'tiny-invariant';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import { TypedRowSchema } from './typed-row-schema.ts';
import type { Source, Typed } from './types.ts';

export function addTyped(db: Database, input: { to: string; toId: string | null; toName: string | null; text: string; source: Source; actor: string }): Typed {
  if (!input.to.trim()) throw new HqError('bad_args', '--to is required');
  if (!input.text.trim()) throw new HqError('bad_args', '--text must not be empty');
  return db
    .transaction(() => {
      const id = Number(
        db
          .query(
            `INSERT INTO typed (to_session, to_id, to_name, text, source_kind, source_ref, source_at, typed_by, at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(input.to, input.toId, input.toName, input.text, input.source.kind, input.source.ref, input.source.at, input.actor, iso(now())).lastInsertRowid,
      );
      logEvent(db, 'hq', `typed:${id}`, 'typed', input.actor, null, null, { to: input.toName ?? input.to, source: `${input.source.kind}:${input.source.ref}` });
      const typed = runSyncRow(db, kdb(db).selectFrom('typed').selectAll().where('id', '=', id).compile(), TypedRowSchema);
      invariant(typed, 'the typed row just inserted is readable in the same transaction');
      return typed;
    })
    .immediate();
}
