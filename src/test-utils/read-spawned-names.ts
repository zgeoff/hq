import { z } from 'zod';
import type { FakeAtcState } from '../../test/build-fake-atc-state.ts';

const SpawnInputSchema = z.object({ name: z.string() });

export function readSpawnedNames(atc: Pick<FakeAtcState, 'calls'>): string[] {
  return atc.calls.filter((call) => call.method === 'session.spawn').map((call) => SpawnInputSchema.parse(call.input).name);
}
