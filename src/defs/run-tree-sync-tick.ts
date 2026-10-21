import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import type { TreeName } from '../prompts/trees.ts';
import { runTreeSync } from './run-tree-sync.ts';
import { TREE_META } from './tree-meta.ts';
import { TREE_SYNC } from './tree-sync.ts';
import type { TreeSync } from './types.ts';

interface SyncWho {
  actor: string;
  tree: TreeName;
}

// The watcher's step, and `hq defs sync`: sync one tree, remember the result for hq health, log a move.
export function runTreeSyncTick(db: Database, actor: string, tree: TreeName = 'hq'): TreeSync | null {
  const synced = runTreeSync(tree);
  return synced ? writeSyncResult(db, { actor, tree }, synced) : null;
}

function writeSyncResult(db: Database, who: SyncWho, synced: TreeSync): TreeSync {
  // A ref lock twice in a row (two ticks, each with a retry) is no longer a passing race.
  const result = readRepeatedLock(db, who.tree, synced) ? { ...synced, ok: false, line: `${synced.line}; the same on the tick before` } : synced;
  setMeta(db, TREE_META[who.tree], JSON.stringify(result));
  if (result.reattached) {
    logEvent(db, 'hq', 'defs', 'tree-reattached', who.actor, null, null, { tree: who.tree, from: result.reattached, line: result.line });
  }
  if (result.changed) {
    logEvent(db, 'hq', 'defs', 'tree-forwarded', who.actor, null, null, { tree: who.tree, line: result.line });
  }
  return result;
}

function readRepeatedLock(db: Database, tree: TreeName, synced: TreeSync): boolean {
  if (!synced.transient) {
    return false;
  }
  try {
    return metaJson(db, TREE_META[tree], TREE_SYNC.nullable(), null)?.transient === true;
  } catch {
    return false;
  }
}
