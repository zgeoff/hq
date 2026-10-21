import type { Database } from 'bun:sqlite';
import { checkout } from '../review/checkout.ts';
import type { Runner } from '../runner/types.ts';
import { assertPR } from './assert-pr.ts';
import { buildRunDir } from './build-run-dir.ts';
import { buildSlug } from './build-slug.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import { parseLowerRepo } from './parse-lower-repo.ts';
import { requirePinned } from './require-pinned.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import { runNoslopCheck } from './run-noslop-check.ts';
import type { NoslopCheckResult } from './run-noslop-check.ts';

export interface PRRequest {
  run: Runner;
  db: Database;
  rawRepo: string;
  pr: number;
  owner?: string | undefined;
  repoDir?: string | undefined;
}

export async function runReviewCheck(request: PRRequest): Promise<NoslopCheckResult> {
  assertPR(request.pr);
  const parsed = parseLowerRepo(request.rawRepo, request.owner),
    sha = requirePinned(loadNoslopSettings(request.db).sha),
    directory = await checkout(request.run, buildSlug(parsed), parsed.repo, request.repoDir);
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the property is the check context's own
  return await runNoslopCheck({ run: request.run, db: request.db, slug: buildSlug(parsed), repo: parsed.repo, pr: request.pr, dir: directory, clone: buildRunDir(resolveNoslopDir(), sha), sha });
}
