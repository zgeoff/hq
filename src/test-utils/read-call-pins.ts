import { z } from 'zod';
import type { FakeAtcState } from '../../test/build-fake-atc-state.ts';

const PinInputSchema = z.object({ pinned: z.boolean().optional() });

export function readCallPins(atc: Pick<FakeAtcState, 'calls'>): [string, boolean | undefined][] {
  return atc.calls.map((call) => [call.method, PinInputSchema.parse(call.input).pinned]);
}
