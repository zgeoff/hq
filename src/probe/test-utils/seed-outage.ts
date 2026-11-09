import { writeOutage } from '../write-outage.ts';
import type { OutageInput } from '../types.ts';
import { buildMockOutageInput } from './build-mock-outage-input.ts';
import type { ProbeDeps } from './types.ts';

export function seedOutage(deps: ProbeDeps, input: Partial<Omit<OutageInput, 'kind'>> = {}): number {
  return writeOutage(deps.db, buildMockOutageInput({ ...input, kind: 'down' }));
}
