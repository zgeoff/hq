import { HqError } from '../errors.ts';
import type { TreeName } from '../prompts/trees.ts';
import { TREES } from '../prompts/trees.ts';

export function parseTree(raw: string): TreeName {
  if (isTreeName(raw)) {
    return raw;
  }
  throw new HqError('bad_args', `the tree must be ${Object.keys(TREES).join(' or ')}`);
}

function isTreeName(raw: string): raw is TreeName {
  return Object.hasOwn(TREES, raw);
}
