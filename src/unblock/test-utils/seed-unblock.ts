import invariant from 'tiny-invariant';
import { addUnblock } from '../add-unblock.ts';
import type { UnblockInput, UnblockItem } from '../types.ts';
import { buildMockUnblockInput } from './build-mock-unblock-input.ts';
import type { UnblockDeps } from './types.ts';

export function seedUnblock(deps: UnblockDeps, input: Partial<UnblockInput> = {}): UnblockItem {
  const added = addUnblock(deps.db, buildMockUnblockInput(input));

  invariant(added.item.state === 'open');

  return added.item;
}
