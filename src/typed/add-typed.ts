// Typed lines: each line a session types into another session as the owner (today z-stu, through
// atc_terminal_type), with where the owner said it. An audit trail the owner reads when something
// looks off.
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
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
      return db.query('SELECT * FROM typed WHERE id = ?').get(id) as Typed;
    })
    .immediate();
}
