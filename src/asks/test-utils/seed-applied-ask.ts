import { applyAsk } from '../apply-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedAnsweredAsk } from './seed-answered-ask.ts';
import type { AsksDeps } from './types.ts';

export function seedAppliedAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedAnsweredAsk(deps, input);

  return applyAsk(deps.db, ask.id, ask.kind, 'none', null, 'z-stu');
}
