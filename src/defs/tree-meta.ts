import type { TreeName } from '../prompts/trees.ts';

// The meta key holding each tree's last sync.
export const TREE_META: Record<TreeName, string> = { hq: 'defs_tree_sync', private: 'private_tree_sync' };
