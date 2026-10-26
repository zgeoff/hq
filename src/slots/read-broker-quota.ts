import type { Database } from 'bun:sqlite';
import { readSlotRows } from '../capacity/fleet/read-slot-rows.ts';
import { pickBrokerQuota } from './pick-broker-quota.ts';
import type { BrokerQuota } from './pick-broker-quota.ts';
import { readBrokerSlot } from './read-broker-slot.ts';

// The slot reads one look back covers: more than the 2.5 h a read stays fresh.
const LOOK_BACK_MS = 3 * 3_600_000;

// `hq capacity broker`: the imp broker's Claude quota from hq's slot reads.
export function readBrokerQuota(db: Database, at: Date): BrokerQuota {
  const rows = readSlotRows(db, new Date(at.getTime() - LOOK_BACK_MS), at);
  return pickBrokerQuota(readBrokerSlot(db), rows, at);
}
