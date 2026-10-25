import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { checkout } from '../review/checkout.ts';
import type { Runner } from '../runner/types.ts';
import { readPRPatchID } from './read-pr-patch-id.ts';

export interface PatchFill {
  run: Runner;
  db: Database;

  // The report's window: only the PRs with a round since this time are filled. All PRs when absent.
  since?: string | undefined;
}

const UnfilledSchema = z.array(z.object({ id: z.number(), repo: z.string(), head: z.string(), base: z.string() }));

// Stores the PR diff's patch-id on each ok review from before v45. A diff git cannot read gets '',
// never read again; a repo hq has no checkout of waits for a later report. Returns the ids found.
export async function fillRoundPatchIDs(fill: PatchFill): Promise<number> {
  const cutoff = fill.since === undefined ? '' : new Date(fill.since).toISOString();
  const rows = UnfilledSchema.parse(
    fill.db
      .query(
        "SELECT id, repo, head, base FROM noslop_rounds WHERE kind = 'review' AND ok = 1 AND patch_id IS NULL AND head IS NOT NULL AND base IS NOT NULL AND (repo, pr) IN (SELECT repo, pr FROM noslop_rounds WHERE started_at >= ?) ORDER BY id",
      )
      .all(cutoff),
  );
  const directories = new Map<string, string | null>();
  let filled = 0;
  for (const row of rows) {
    const directory = await readCheckout(fill.run, row.repo, directories);
    if (directory === null) {
      continue;
    }
    const patchID = await readPRPatchID(fill.run, directory, row.base, row.head);
    fill.db.query('UPDATE noslop_rounds SET patch_id = ? WHERE id = ?').run(patchID ?? '', row.id);
    filled += patchID === null ? 0 : 1;
  }
  return filled;
}

// One checkout per repo for the whole fill; null when hq cannot make one.
async function readCheckout(run: Runner, repo: string, directories: Map<string, string | null>): Promise<string | null> {
  if (!directories.has(repo)) {
    try {
      const directory = await checkout(run, `zgeoff/${repo}`, repo);
      directories.set(repo, directory);
    } catch {
      directories.set(repo, null);
    }
  }
  return directories.get(repo) ?? null;
}
