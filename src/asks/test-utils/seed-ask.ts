import invariant from 'tiny-invariant';
import { addAsk } from '../add-ask.ts';
import type { AddInput, Ask } from '../types.ts';
import { buildMockAddInput } from './build-mock-add-input.ts';
import type { AsksDeps } from './types.ts';

export function seedAsk(deps: AsksDeps, input: Partial<AddInput> = {}): Ask {
  const added = addAsk(deps.db, buildMockAddInput(input));
  invariant(added.result === 'added' && added.ask.state === 'queued');

  return added.ask;
}
