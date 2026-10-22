import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { checkUnblock } from '../check-unblock.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { closedForIssues } from './closed-for-issues.ts';
import { getUnblock } from './get-unblock.ts';
import { mergeDoneWhen } from './merge-done-when.ts';
import type { DoneWhen, UnblockInput, UnblockItem, UnblockWarning } from './types.ts';

// Add, or refresh an open item with the same id. A refresh keeps its added time
// and its place in the push cursor; a closed id comes back as a new item.
// A new or reopened item warns about closed items for the same issues; it is still added.
export function addUnblock(
  db: Database,
  input: UnblockInput,
): { item: UnblockItem; result: 'added' | 'updated' | 'noop' | 'reopened'; warnings: UnblockWarning[] } {
  if (!input.task.trim()) throw new HqError('bad_args', 'task must not be empty');
  if (input.id !== null && !/^[a-z0-9][a-z0-9._-]*$/i.test(input.id)) throw new HqError('bad_args', `id "${input.id}" must be a slug`);
  return db
    .transaction(() => {
      const t = iso(now());
      const prev = input.id ? getUnblock(db, input.id) : null;
      const rank = input.rank === undefined ? (prev?.state === 'open' ? prev.rank : null) : input.rank;
      const fields = [input.task, input.minutes, JSON.stringify(input.unblocks), rank, JSON.stringify(input.notify)] as const;
      if (prev && prev.state === 'open') {
        const doneWhen = mergeDoneWhen(prev.done_when, input.doneWhen ?? []);
        const clear = input.fromItem === true ? '' : ', title=NULL, item=NULL',
          same =
            prev.task === input.task &&
            prev.minutes === input.minutes &&
            JSON.stringify(prev.unblocks) === fields[2] &&
            prev.rank === rank &&
            doneWhen.length === prev.done_when.length &&
            JSON.stringify(prev.notify) === fields[4] &&
            (input.fromItem === true || (prev.title === null && prev.item === null));
        if (same) return { item: prev, result: 'noop' as const, warnings: [] };
        checkUnblock(prev.id, 'updated', prev.state);
        db.query(`UPDATE unblocks SET task=?, minutes=?, unblocks=?, rank=?, notify=?, done_when=?${clear}, updated_at=? WHERE id=?`).run(...fields, toColumn(doneWhen), t, prev.id);
        logEvent(db, 'unblock', prev.id, 'updated', input.actor, 'open', 'open', { task: input.task, ...(doneWhen.length === prev.done_when.length ? {} : { done_when: doneWhen }) });
        return { item: getUnblock(db, prev.id)!, result: 'updated' as const, warnings: [] };
      }
      const seq = nextSeq(db);
      if (prev) {
        checkUnblock(prev.id, 'reopened', prev.state);
        db.query(
          `UPDATE unblocks SET task=?, minutes=?, unblocks=?, rank=?, notify=?, done_when=?, state='open', added_by=?, added_seq=?, added_at=?, closed_at=NULL, note=NULL, due_at=NULL, title=NULL, item=NULL, updated_at=? WHERE id=?`,
        ).run(...fields, toColumn(input.doneWhen ?? []), input.actor, seq, t, t, prev.id);
        logEvent(db, 'unblock', prev.id, 'reopened', input.actor, prev.state, 'open', { task: input.task });
        return { item: getUnblock(db, prev.id)!, result: 'reopened' as const, warnings: closedForIssues(db, input.unblocks.map((x) => x.issue), prev.id) };
      }
      const id = input.id ?? `u${seq}`;
      if (getUnblock(db, id)) throw new HqError('id_taken', `unblock id ${id} exists: pass --id`);
      db.query(
        `INSERT INTO unblocks (id, task, minutes, unblocks, rank, notify, done_when, added_by, state, added_seq, added_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      ).run(id, ...fields, toColumn(input.doneWhen ?? []), input.actor, seq, t, t);
      logEvent(db, 'unblock', id, 'added', input.actor, null, 'open', { task: input.task });
      return { item: getUnblock(db, id)!, result: 'added' as const, warnings: closedForIssues(db, input.unblocks.map((x) => x.issue), id) };
    })
    .immediate();
}

function toColumn(doneWhen: DoneWhen[]): string | null {
  return doneWhen.length === 0 ? null : JSON.stringify(doneWhen);
}

function nextSeq(db: Database): number {
  const n = Number(getMeta(db, 'unblock_seq') ?? '0') + 1;
  setMeta(db, 'unblock_seq', String(n));
  return n;
}
