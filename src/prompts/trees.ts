import { DEFS_SOURCES } from './defs-sources.ts';
import { PRIVATE_TREE } from './private-tree.ts';

// The trees hq keeps on origin/main, by the name `hq defs setup` and the sync take.
export const TREES = { hq: DEFS_SOURCES.hq, private: PRIVATE_TREE } as const;
export type TreeName = keyof typeof TREES;
