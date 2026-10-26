import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { BROKER_META } from './broker-record.ts';
import type { BrokerRecord } from './broker-record.ts';

export interface BrokerChange {
  slot: string;
  proof: string | undefined;
  note: string | undefined;
  actor: string;
  at: Date;
}

// `hq slots broker <n> --proof T`: the imp broker's slot, with the check that proved it.
export function writeBrokerSlot(db: Database, change: BrokerChange): BrokerRecord {
  const slot = Number(change.slot);
  if (!/^[1-4]$/u.test(change.slot)) {
    throw new HqError('bad_args', `hq slots broker takes a slot from 1 to 4, not "${change.slot.slice(0, 20)}"`);
  }
  const proof = requireOneLine(change.proof, '--proof', 'the request or spawn id of the check that proved the broker runs on this slot');
  const note = change.note === undefined ? null : requireOneLine(change.note, '--note', 'a short note');
  const record: BrokerRecord = { slot, proof, note, at: iso(change.at), by: change.actor };
  db.transaction(() => {
    setMeta(db, BROKER_META, JSON.stringify(record));
    logEvent(db, 'hq', 'slots:broker', 'broker-slot', change.actor, null, String(slot), { proof, note });
  }).immediate();
  return record;
}

const TEXT_MAX = 200;

function requireOneLine(text: string | undefined, flag: string, what: string): string {
  const trimmed = (text ?? '').trim();
  if (trimmed === '' || /[\r\n]/u.test(trimmed) || trimmed.length > TEXT_MAX) {
    throw new HqError('bad_args', `${flag} needs ${what}, one line of at most ${TEXT_MAX} characters`);
  }
  return trimmed;
}
