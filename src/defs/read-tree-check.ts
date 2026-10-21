import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { metaJson } from '../db/meta-json.ts';
import type { TreeName } from '../prompts/trees.ts';
import { TREES } from '../prompts/trees.ts';
import { TREE_META } from './tree-meta.ts';
import { TREE_SYNC } from './tree-sync.ts';
import type { Check, TreeSync } from './types.ts';

type TreeHealth = Check & { key: string };

interface TreeNames {
  key: string;
  label: string;
}

// NAMES is what each tree's health line is called.
const NAMES: Record<TreeName, TreeNames> = {
    hq: { key: 'defs-tree', label: 'hq-defs' },
    private: { key: 'private-tree', label: 'hq-private' },
  },
  TREE_STALE_MS = 30 * 60_000;

// For hq health: the last sync failed, or none ran for 30 min while the checkout exists. hq-private
// is not optional, since the start prompts are read from it: no checkout is a fault there, where
// hq-defs without a checkout is just not set up.
export function readTreeCheck(db: Database, at: Date, tree: TreeName = 'hq'): TreeHealth | null {
  const dir = TREES[tree].dir();
  if (!existsSync(`${dir}/.git`)) {
    return tree === 'private'
      ? { key: NAMES.private.key, ok: false, line: `hq-private: no checkout at ${dir} (hq defs setup private); start prompts can't be read without it` }
      : null;
  }
  return buildTreeHealth(tree, at, readSyncRecord(db, tree));
}

function readSyncRecord(db: Database, tree: TreeName): TreeSync | null {
  try {
    return metaJson(db, TREE_META[tree], TREE_SYNC.nullable(), null);
  } catch {
    return { at: '', ok: false, changed: false, line: '' };
  }
}

function buildTreeHealth(tree: TreeName, at: Date, record: TreeSync | null): TreeHealth {
  const names = NAMES[tree];
  if (!record) {
    return { key: names.key, ok: false, line: `${names.label}: never synced (the hq-lanes watcher syncs it each tick; hq defs sync)` };
  }
  if (typeof record.at !== 'string' || typeof record.ok !== 'boolean' || typeof record.line !== 'string' || !Number.isFinite(Date.parse(record.at))) {
    return { key: names.key, ok: false, line: `${names.label}: the last sync record is unreadable; hq defs sync writes a new one` };
  }
  return buildAgedHealth(tree, record, at.getTime() - Date.parse(record.at));
}

function buildAgedHealth(tree: TreeName, record: TreeSync, age: number): TreeHealth {
  const names = NAMES[tree];
  if (age > TREE_STALE_MS || age < -5 * 60_000) {
    return { key: names.key, ok: false, line: `${names.label}: last synced ${record.at.slice(0, 16)}Z, ${age < 0 ? 'in the future' : 'over 30 min ago'}` };
  }
  return { key: names.key, ok: record.ok, line: tree === 'private' ? `${names.label}: ${record.line}` : record.line };
}
