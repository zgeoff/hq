import type { Database } from 'bun:sqlite';
import type { TreeName } from '../prompts/trees.ts';
import { runTreeSyncTick } from './run-tree-sync-tick.ts';
import type { TreeSync } from './types.ts';

interface TreeResult {
  error?: string;
  sync: TreeSync | null;
  tree: TreeName;
}

// Each tree's own sync, one after the other: a failure in one never stops the other.
export function runAllTreeSyncs(db: Database, actor: string): TreeResult[] {
  const trees: TreeName[] = ['hq', 'private'];
  return trees.map((tree) => runOneTreeSync(db, actor, tree));
}

function runOneTreeSync(db: Database, actor: string, tree: TreeName): TreeResult {
  try {
    return { tree, sync: runTreeSyncTick(db, actor, tree) };
  } catch (error) {
    return { tree, sync: null, error: error instanceof Error ? error.message : String(error) };
  }
}
