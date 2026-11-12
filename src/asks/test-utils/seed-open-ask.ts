import { openAsk } from '../open-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedAsk } from './seed-ask.ts';
import type { AsksDeps } from './types.ts';
import { roleName } from '../../roles/role-name.ts';

export function seedOpenAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedAsk(deps, input);

  return openAsk(deps.db, { kind: ask.kind, id: ask.id, force: false, actor: roleName('owner') });
}
