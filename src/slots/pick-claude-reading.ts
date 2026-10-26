import { match } from 'ts-pattern';
import type { BrokerQuota } from './pick-broker-quota.ts';

// The provider reading capacity.sh puts under `providers.claude` for an imp launch, so the script
// reads it as is and never maps the broker states itself.
export type ClaudeReading =
  | { error: string }
  | { slot: number; proof: string; proofAgeHours: number; used: number; resetsAt: string | null; source: string }
  | { slot: number; proof: string; proofAgeHours: number; used: null; unknown: true; why: string; source: string };

export function pickClaudeReading(quota: BrokerQuota): ClaudeReading {
  return match(quota)
    .with({ state: 'read' }, (read) => ({ slot: read.slot, proof: read.proof, proofAgeHours: read.proofAgeHours, used: read.used, resetsAt: read.resetsAt, source: `hq slot read of the imp broker slot ${read.slot}, ${read.readAt}` }))
    .with({ state: 'unknown-proved' }, (unknown) => ({ slot: unknown.slot, proof: unknown.proof, proofAgeHours: unknown.proofAgeHours, used: null, unknown: true as const, why: unknown.why, source: 'hq capacity broker' }))
    .with({ state: 'unknown' }, { state: 'none' }, (held) => ({ error: `imp broker quota unknown: ${held.why}` }))
    .exhaustive();
}
