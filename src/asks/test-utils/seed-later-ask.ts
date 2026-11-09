import { laterAsk } from '../later-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedAsk } from './seed-ask.ts';
import type { AsksDeps } from './types.ts';

export function seedLaterAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedAsk(deps, input);

  return laterAsk(deps.db, ask.id, ask.kind, null, 'z-stu');
}
