import invariant from 'tiny-invariant';
import type { UsageSample } from '../../capacity/usage-sample.ts';
import { writeUsageSample } from '../write-usage-sample.ts';
import { buildMockUsageSample } from './build-mock-usage-sample.ts';
import type { GoalsDeps } from './types.ts';

export function seedUsageSample(deps: GoalsDeps, input: Partial<UsageSample> = {}): UsageSample {
  const sample = buildMockUsageSample(input);
  invariant(writeUsageSample(deps.db, sample));

  return sample;
}
