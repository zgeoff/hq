import { applyAsk } from '../apply-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { seedAnsweredAsk } from './seed-answered-ask.ts';
import type { AsksDeps } from './types.ts';
import { roleName } from '../../roles/role-name.ts';

export function seedAppliedAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const ask = seedAnsweredAsk(deps, input);

  return applyAsk(deps.db, ask.id, ask.kind, 'none', null, roleName('owner'));
}
