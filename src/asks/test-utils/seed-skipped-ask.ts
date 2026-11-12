import { skipAsk } from '../skip-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedAsk } from './seed-ask.ts';
import type { AsksDeps } from './types.ts';
import { roleName } from '../../roles/role-name.ts';

export function seedSkippedAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedAsk(deps, input);

  return skipAsk(deps.db, ask.id, ask.kind, null, roleName('owner'));
}
