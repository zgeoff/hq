import { seedEvent } from '../../test-utils/seed-event.ts';
import { writeOutageEnd } from '../write-outage-end.ts';
import { seedUnreadyOutage } from './seed-unready-outage.ts';
import type { ProbeDeps } from './types.ts';
import type { OutageInput } from '../types.ts';

export function seedClosedUnreadyOutage(deps: ProbeDeps, input: Partial<Omit<OutageInput, 'kind'>> & { endedAt?: string } = {}): number {
  const { endedAt = '2026-10-14T00:58:00Z', ...outage } = input;
  const id = seedUnreadyOutage(deps, outage);
  writeOutageEnd(deps.db, id, endedAt, seedEvent(deps));

  return id;
}
