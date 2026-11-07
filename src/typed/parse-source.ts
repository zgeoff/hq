import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import type { Source } from './types.ts';
import { isOneOf } from '@zgeoff/std';

const AskKindSchema = buildRowSchema('asks').pick({ kind: true });

const ASK_SOURCE_KINDS = ['call', 'proposal'] as const;

export function parseSource(db: Database, raw: string): Source {
  const consoleAnswer = /^console:(?<id>[A-Za-z0-9._-]+)$/u.exec(raw);
  if (consoleAnswer?.groups?.['id'] !== undefined) {
    return requireConsoleSource(db, consoleAnswer.groups['id']);
  }
  const ask = /^(call|proposal):([A-Za-z0-9._-]+)$/.exec(raw);
  const kind = ask?.[1];
  if (ask && isOneOf(kind, ASK_SOURCE_KINDS)) {
    const row = runSyncRow(db, kdb(db).selectFrom('asks').select('kind').where('id', '=', ask[2]!).compile(), AskKindSchema);
    if (!row) throw new HqError('not_found', `no ${kind} ${ask[2]} in hq`);
    if (row.kind !== kind) throw new HqError('bad_args', `${ask[2]} is a ${row.kind}, not a ${kind}`);
    return { kind, ref: ask[2]!, at: null };
  }
  const chat = /^chat:([0-9a-f-]{8,})@(.+)$/i.exec(raw);
  if (chat) {
    const t = Date.parse(chat[2]!);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(chat[2]!) || Number.isNaN(t)) throw new HqError('bad_args', `chat source time "${chat[2]}" must be a time, such as 2026-10-15T21:04:00Z`);
    if (t > now().getTime() + 60_000) throw new HqError('bad_args', 'the chat source time is in the future');
    return { kind: 'chat', ref: chat[1]!.toLowerCase(), at: iso(new Date(t)) };
  }
  throw new HqError('bad_args', '--source must be call:<id>, proposal:<id>, console:<id> or chat:<typing session id>@<time of the owner\'s message>');
}

function requireConsoleSource(db: Database, id: string): Source {
  if (db.query('SELECT 1 FROM asks WHERE id = ? UNION ALL SELECT 1 FROM unblocks WHERE id = ?').get(id, id) === null) {
    throw new HqError('not_found', `no call, proposal or unblock item ${id} in hq`);
  }
  return { kind: 'console', ref: id, at: null };
}
