import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { Source } from './types.ts';

// call:<id> | proposal:<id> | console:<id> | chat:<session>@<time>. Anything else is refused.
export function parseSource(db: Database, raw: string): Source {
  const consoleAnswer = /^console:(?<id>[A-Za-z0-9._-]+)$/u.exec(raw);
  if (consoleAnswer?.groups?.['id'] !== undefined) {
    return requireConsoleSource(db, consoleAnswer.groups['id']);
  }
  const ask = /^(call|proposal):([A-Za-z0-9._-]+)$/.exec(raw);
  if (ask) {
    const kind = ask[1] as 'call' | 'proposal';
    const row = db.query('SELECT kind FROM asks WHERE id = ?').get(ask[2]!) as { kind: string } | null;
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

// A console answer's id: a call, proposal or unblock item the owner answered on the console page.
function requireConsoleSource(db: Database, id: string): Source {
  if (db.query('SELECT 1 FROM asks WHERE id = ? UNION ALL SELECT 1 FROM unblocks WHERE id = ?').get(id, id) === null) {
    throw new HqError('not_found', `no call, proposal or unblock item ${id} in hq`);
  }
  return { kind: 'console', ref: id, at: null };
}
