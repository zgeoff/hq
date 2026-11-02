import type { DefsSource } from '../prompts/defs-sources.ts';
import { checkTrees } from './check-trees.ts';
import { spawnGrants } from './spawn-grants.ts';
import type { Check } from './types.ts';

export function preflight(source: DefsSource): Check[] {
  return checkTrees(source, spawnGrants);
}
