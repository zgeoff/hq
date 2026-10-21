// Change marks: when the system changed (a skills PR, a grant, an hq release), so stats can
// show a number before and after.
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { getMark } from './get-mark.ts';
import type { Mark } from './mark-kinds.ts';
import { MARK_KINDS } from './mark-kinds.ts';

export function addMark(db: Database, input: { kind: string; text: string; ref: string | null; at: string | null; actor: string }): Mark {
  if (!(MARK_KINDS as readonly string[]).includes(input.kind)) throw new HqError('bad_args', `--kind must be one of ${MARK_KINDS.join(', ')}`);
  const text = input.text.trim();
  if (!text || /[\r\n]/.test(text) || text.length > 300) throw new HqError('bad_args', '--text must be one line, at most 300 characters');
  if (input.ref !== null && !/^https?:\/\/\S+$|^[A-Za-z0-9._-]+#\d+$|^[A-Z][A-Z0-9]*-\d+$/.test(input.ref)) throw new HqError('bad_args', '--ref must be a URL, repo#n or GEO-n');
  const t = now();
  const at = input.at ? new Date(input.at) : t;
  if (Number.isNaN(at.getTime())) throw new HqError('bad_args', '--at must be a time, such as 2026-10-15T07:00:00Z');
  if (at.getTime() > t.getTime() + 60_000) throw new HqError('bad_args', '--at is in the future');
  return db
    .transaction(() => {
      const id = Number(
        db.query('INSERT INTO marks (at, kind, text, ref, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?)').run(iso(at), input.kind, text, input.ref, input.actor, iso(t)).lastInsertRowid,
      );
      logEvent(db, 'hq', `mark:${id}`, 'marked', input.actor, null, null, { kind: input.kind, at: iso(at) });
      return getMark(db, id)!;
    })
    .immediate();
}
