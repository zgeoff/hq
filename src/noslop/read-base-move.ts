import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';
import { pickBaseMove, pickComparedReview } from './pick-base-move.ts';
import type { BaseMove, PRRefs } from './pick-base-move.ts';
import { readPRPatchID } from './read-pr-patch-id.ts';

export interface BaseMoveRequest {
  run: Runner;
  db: Database;
  slug: string;
  repo: string;
  pr: number;

  // The checkout of the repo, where the PR head and its base are fetched.
  directory: string;

  // Runs a function under the repo's lock, as the review's git steps do.
  lock: <T>(fn: () => Promise<T>) => Promise<T>;
}

const LastReviewSchema = z.object({ head: z.string().nullable(), patch_id: z.string().nullable() }).nullable();

export async function readBaseMove(request: BaseMoveRequest): Promise<BaseMove | null> {
  const last = LastReviewSchema.parse(
    request.db.query("SELECT head, patch_id FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 AND confirm = 0 ORDER BY id DESC LIMIT 1").get(request.repo, request.pr) ?? null,
  );
  const refs = last === null ? null : await readPRRefs(request);
  const compared = pickComparedReview(last, refs);
  if (compared === null || refs === null) {
    return null;
  }
  await request.lock(async () => {
    await request.run(['git', 'fetch', '-q', 'origin'], { cwd: request.directory });
    await request.run(['git', 'fetch', '-q', 'origin', `pull/${request.pr}/head`], { cwd: request.directory });
  });
  const patchID = await readPRPatchID(request.run, request.directory, `origin/${refs.baseRefName}`, refs.headRefOid);
  return pickBaseMove(compared, refs, patchID);
}

const RefsSchema = z.object({ headRefOid: z.string().min(1), baseRefName: z.string().min(1) });

async function readPRRefs(request: BaseMoveRequest): Promise<PRRefs | null> {
  try {
    const result = await boundedRunner(request.run, CALL_MS)(['gh', 'pr', 'view', String(request.pr), '-R', request.slug, '--json', 'headRefOid,baseRefName']);
    const parsed = RefsSchema.safeParse(JSON.parse(result.stdout));
    return result.code === 0 && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
