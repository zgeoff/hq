import type { DefsSource } from '../prompts/defs-sources.ts';
import { checkTrees } from './check-trees.ts';
import { spawnGrants } from './spawn-grants.ts';
import type { Check } from './types.ts';

// Both trees. hq-defs: its origin, and the capacity script and pacing.json in its working tree.
// hq-private: its origin, every declared role prompt read from its origin/main after a fetch, and
// the grants check run from the hq-defs checkout.
export function preflight(source: DefsSource): Check[] {
  return checkTrees(source, spawnGrants);
}
