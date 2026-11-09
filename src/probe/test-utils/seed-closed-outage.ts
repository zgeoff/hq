import { seedEvent } from '../../test-utils/seed-event.ts';
import { writeOutageEnd } from '../write-outage-end.ts';
import { seedOutage } from './seed-outage.ts';
import type { ProbeDeps } from './types.ts';
import type { OutageInput } from '../types.ts';

export function seedClosedOutage(deps: ProbeDeps, input: Partial<Omit<OutageInput, 'kind'>> & { endedAt?: string } = {}): number {
  const { endedAt = '2026-10-14T00:58:00Z', ...outage } = input;
  const id = seedOutage(deps, outage);
  writeOutageEnd(deps.db, id, endedAt, seedEvent(deps));

  return id;
}
