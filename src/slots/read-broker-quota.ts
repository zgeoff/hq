import type { Database } from 'bun:sqlite';
import { readSlotRows } from '../capacity/fleet/read-slot-rows.ts';
import { latestSample } from '../capacity/latest-sample.ts';
import { pickBrokerQuota } from './pick-broker-quota.ts';
import type { BrokerQuota } from './pick-broker-quota.ts';
import { readBrokerSlot } from './read-broker-slot.ts';

// The slot reads one look back covers: more than the 2.5 h a read stays fresh.
const LOOK_BACK_MS = 3 * 3_600_000;

export async function readBrokerQuota(db: Database, at: Date): Promise<BrokerQuota> {
  const rows = readSlotRows(db, new Date(at.getTime() - LOOK_BACK_MS), at);
  const reading = await latestSample(db);
  const sample = reading === null ? null : { at: reading.at, five: reading.claude_five_hour, fiveResetsAt: reading.claude_five_hour_resets_at, seven: reading.claude_seven_day, sevenResetsAt: reading.claude_seven_day_resets_at };
  return pickBrokerQuota(readBrokerSlot(db), rows, sample, at);
}
