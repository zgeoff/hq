import { match } from 'ts-pattern';
import type { BrokerRecord } from './broker-record.ts';
import type { BrokerQuota } from './pick-broker-quota.ts';

export function formatBrokerRecord(record: BrokerRecord): string {
  return `imp broker: slot ${record.slot}, proof ${record.proof}, recorded ${record.at} by ${record.by}${record.note === null ? '' : ` (${record.note})`}`;
}

export function formatBrokerQuota(quota: BrokerQuota): string {
  return match(quota)
    .with({ state: 'none' }, (none) => `imp broker: unknown, ${none.why}`)
    .with({ state: 'read' }, (read) => `imp broker: slot ${read.slot} at ${read.used}% (read ${read.readAt}${read.resetsAt === null ? '' : `, resets ${read.resetsAt}`}); proof ${read.proof}, ${read.proofAgeHours} h old`)
    .with({ state: 'unknown-proved' }, (unknown) => `imp broker: slot ${unknown.slot} unknown, ${unknown.why}; its proof ${unknown.proof} is ${unknown.proofAgeHours} h old, so imp launches have room`)
    .with({ state: 'unknown' }, (unknown) => `imp broker: slot ${unknown.slot} unknown, ${unknown.why}; imp launches hold`)
    .exhaustive();
}
