import { answerAsk } from '../answer-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedOpenAsk } from './seed-open-ask.ts';
import type { AsksDeps } from './types.ts';
import { roleName } from '../../roles/role-name.ts';

export function seedAnsweredAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedOpenAsk(deps, input);

  return answerAsk(deps.db, { id: ask.id, kind: ask.kind, answer: 'Green, please.', actor: roleName('owner') });
}
