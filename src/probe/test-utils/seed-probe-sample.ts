import { writeProbeSample } from '../write-probe-sample.ts';
import type { ProbeSampleInput } from '../types.ts';
import { buildMockProbeSampleInput } from './build-mock-probe-sample-input.ts';
import type { ProbeDeps } from './types.ts';

export function seedProbeSample(deps: ProbeDeps, input: Partial<Omit<ProbeSampleInput, 'targetOk' | 'controlOk'>> = {}): void {
  writeProbeSample(deps.db, buildMockProbeSampleInput({ ...input, targetOk: true, controlOk: null }));
}
