import type { Database } from 'bun:sqlite';
import { readFleetUsageSamples } from '../capacity/fleet/read-fleet-usage-samples.ts';
import { readSlotRows } from '../capacity/fleet/read-slot-rows.ts';
import { pickBrokerQuota } from './pick-broker-quota.ts';
import type { BrokerQuota } from './pick-broker-quota.ts';
import { readBrokerSlot } from './read-broker-slot.ts';

// The slot reads and usage samples one look back covers: more than the 2.5 h a read stays fresh.
const LOOK_BACK_HOURS = 3;

export function readBrokerQuota(db: Database, at: Date): BrokerQuota {
  const rows = readSlotRows(db, new Date(at.getTime() - LOOK_BACK_HOURS * 3_600_000), at);
  const samples = readFleetUsageSamples(db, at, LOOK_BACK_HOURS).map((sample) => ({ at: sample.at, five: sample.five_hour, fiveResetsAt: sample.five_hour_resets_at, seven: sample.seven_day, sevenResetsAt: sample.seven_day_resets_at }));
  return pickBrokerQuota(readBrokerSlot(db), rows, samples, at);
}
