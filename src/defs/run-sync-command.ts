import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { TREES } from '../prompts/trees.ts';
import { runAllTreeSyncs } from './run-all-tree-syncs.ts';

type TreeResult = ReturnType<typeof runAllTreeSyncs>[number];

// `hq defs sync`: fast-forward both checkouts. A tree with no checkout is reported, not failed
// (hq health is what goes red); a refused or failed sync fails the command.
export function runSyncCommand(db: Database, actor: string): { data: Record<string, unknown>; text: string } {
  const results = runAllTreeSyncs(db, actor);
  checkSynced(results);
  return {
    data: { synced: results.find((result) => result.tree === 'hq')?.sync ?? null, trees: Object.fromEntries(results.map((result) => [result.tree, result.sync])) },
    text: results.map((result) => formatTreeResult(result)).join('\n'),
  };
}

function checkSynced(results: TreeResult[]): void {
  const failed = results.filter((result) => result.error || (result.sync && !result.sync.ok));
  if (failed.length > 0) {
    throw new HqError('not_synced', failed.map((result) => formatTreeResult(result)).join('\n'));
  }
}

function formatTreeResult(result: TreeResult): string {
  return result.error ?? result.sync?.line ?? `${TREES[result.tree].dir()} is not a checkout (hq defs setup ${result.tree})`;
}
