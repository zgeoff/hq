import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { pickBaseMoveCover } from './pick-base-move-cover.ts';
import { readPRPatchID } from './read-pr-patch-id.ts';

export type BaseMoveCover = { covered: true; reviewed: string } | { covered: false; why: string };

export interface CoverRequest {
  db: Database;
  run: Runner;
  repo: string;
  pr: number;

  // The head noslop's summary comment names, and the PR's head and base now.
  summaryHead: string;
  head: string;
  baseNow: string;

  // A checkout of the repo to read both diffs in.
  checkout: () => Promise<string>;
}

const CoverRowsSchema = z.array(z.object({ head: z.string().nullable(), base: z.string().nullable(), confirm: z.number(), base_move: z.number(), patch_id: z.string().nullable() }));

// Whether noslop's review at the summary head covers the PR head after a base move. hq's records must
// say so, and git must agree now: each head's diff from its own merge base gives one patch-id, the
// one hq recorded.
export async function readBaseMoveCover(request: CoverRequest): Promise<BaseMoveCover> {
  const rows = CoverRowsSchema.parse(request.db.query("SELECT head, base, confirm, base_move, patch_id FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 ORDER BY id").all(request.repo, request.pr));
  const stored = pickBaseMoveCover(rows, request.summaryHead, request.head);
  if (!stored.stored) {
    return { covered: false, why: stored.why };
  }
  const directory = await request.checkout().catch(() => null);
  if (directory === null) {
    return { covered: false, why: 'hq has no checkout of the repo to recompute the patch-ids in' };
  }
  const fetched = await runMissingFetch(request.run, directory, [request.summaryHead, request.head, request.baseNow, stored.reviewBase]);
  if (!fetched) {
    return { covered: false, why: 'git cannot fetch the commits to recompute the patch-ids' };
  }
  const reviewed = await readPRPatchID(request.run, directory, stored.reviewBase, request.summaryHead);
  const now = await readPRPatchID(request.run, directory, request.baseNow, request.head);
  if (reviewed === null || now === null || reviewed !== now || now !== stored.patchId) {
    return { covered: false, why: `git's patch-ids now do not match: ${request.head.slice(0, 7)} ${now ?? 'none'}, ${request.summaryHead.slice(0, 7)} ${reviewed ?? 'none'}, recorded ${stored.patchId}` };
  }
  return { covered: true, reviewed: request.summaryHead };
}

// Fetches from origin each commit the checkout lacks; false when one stays missing.
async function runMissingFetch(run: Runner, directory: string, shas: readonly string[]): Promise<boolean> {
  const unique = [...new Set(shas)];
  const checks = await Promise.all(unique.map((sha) => run(['git', 'cat-file', '-e', `${sha}^{commit}`], { cwd: directory })));
  const missing = unique.filter((_sha, index) => checks[index]?.code !== 0);
  if (missing.length === 0) {
    return true;
  }
  const fetched = await run(['git', 'fetch', '-q', 'origin', ...missing], { cwd: directory });
  return fetched.code === 0;
}
