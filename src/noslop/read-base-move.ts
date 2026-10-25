import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';
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

// The head of the PR's last ok review when the PR has moved to a new head with the same own diff:
// only its base moved. Null otherwise, and whenever hq cannot tell, so the review runs as a round.
// Only the last ok review counts: a push back to an older reviewed diff is a round.
export async function readBaseMove(request: BaseMoveRequest): Promise<string | null> {
  const last = LastReviewSchema.parse(
    request.db.query("SELECT head, patch_id FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 ORDER BY id DESC LIMIT 1").get(request.repo, request.pr) ?? null,
  );
  if (last === null || last.head === null || last.patch_id === null || last.patch_id === '') {
    return null;
  }
  const refs = await readPRRefs(request);
  if (refs === null || refs.headRefOid === last.head) {
    return null;
  }
  await request.lock(async () => {
    await request.run(['git', 'fetch', '-q', 'origin'], { cwd: request.directory });
    await request.run(['git', 'fetch', '-q', 'origin', `pull/${request.pr}/head`], { cwd: request.directory });
  });
  const patchID = await readPRPatchID(request.run, request.directory, `origin/${refs.baseRefName}`, refs.headRefOid);
  return patchID === last.patch_id ? last.head : null;
}

const RefsSchema = z.object({ headRefOid: z.string().min(1), baseRefName: z.string().min(1) });

async function readPRRefs(request: BaseMoveRequest): Promise<z.infer<typeof RefsSchema> | null> {
  try {
    const result = await boundedRunner(request.run, CALL_MS)(['gh', 'pr', 'view', String(request.pr), '-R', request.slug, '--json', 'headRefOid,baseRefName']);
    const parsed = RefsSchema.safeParse(JSON.parse(result.stdout));
    return result.code === 0 && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
