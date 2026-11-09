import invariant from 'tiny-invariant';
import type { ItemExtras } from '../../parse-item-input.ts';
import { getUnblock } from '../get-unblock.ts';
import type { UnblockInput, UnblockItem } from '../types.ts';
import { writeUnblockItem } from '../write-unblock-item.ts';
import { seedUnblock } from './seed-unblock.ts';
import type { UnblockDeps } from './types.ts';

type UnblockLink = ItemExtras['links'][number];

export function seedLinkedUnblock(deps: UnblockDeps, input: Partial<UnblockInput> & { links: UnblockLink[] }): UnblockItem {
  const { links, ...unblockInput } = input;
  const added = seedUnblock(deps, unblockInput);

  writeUnblockItem(deps.db, added.id, null, JSON.stringify({ details: [], unblocks: [], links }));

  const linked = getUnblock(deps.db, added.id);
  invariant(linked !== null && linked.item !== null);

  return linked;
}
