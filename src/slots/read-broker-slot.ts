import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { BROKER_META, BrokerRecordSchema } from './broker-record.ts';
import type { BrokerRecord } from './broker-record.ts';

// The imp broker's recorded slot; null before anyone recorded one.
export function readBrokerSlot(db: Database): BrokerRecord | null {
  return metaJson(db, BROKER_META, BrokerRecordSchema.nullable(), null);
}
