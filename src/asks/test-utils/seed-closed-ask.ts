import { closeAsk } from '../close-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedAsk } from './seed-ask.ts';
import type { AsksDeps } from './types.ts';

export function seedClosedAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedAsk(deps, input);

  return closeAsk(deps.db, ask.id, ask.kind, 'no longer needed', 'z-stu');
}
