import { seedBlindProbeSample } from './seed-blind-probe-sample.ts';
import { seedClosedOutage } from './seed-closed-outage.ts';
import { seedClosedUnreadyOutage } from './seed-closed-unready-outage.ts';
import { seedDownProbeSample } from './seed-down-probe-sample.ts';
import { seedOutage } from './seed-outage.ts';
import { seedProbeSample } from './seed-probe-sample.ts';
import { seedUnreadyOutage } from './seed-unready-outage.ts';
import type { ProbeDeps } from './types.ts';

export function buildProbeSeeder(deps: ProbeDeps) {
  return {
    probeSample: (input?: Parameters<typeof seedProbeSample>[1]) => seedProbeSample(deps, input),
    downProbeSample: (input?: Parameters<typeof seedDownProbeSample>[1]) => seedDownProbeSample(deps, input),
    blindProbeSample: (input?: Parameters<typeof seedBlindProbeSample>[1]) => seedBlindProbeSample(deps, input),
    outage: (input?: Parameters<typeof seedOutage>[1]) => seedOutage(deps, input),
    unreadyOutage: (input?: Parameters<typeof seedUnreadyOutage>[1]) => seedUnreadyOutage(deps, input),
    closedOutage: (input?: Parameters<typeof seedClosedOutage>[1]) => seedClosedOutage(deps, input),
    closedUnreadyOutage: (input?: Parameters<typeof seedClosedUnreadyOutage>[1]) => seedClosedUnreadyOutage(deps, input),
  };
}
