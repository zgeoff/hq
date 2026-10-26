import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitRepo } from '../../test/create-git-repo.ts';
import { openDb } from '../db/open-db.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { CoverRow } from './pick-base-move-cover.ts';
import { readBaseMoveCover } from './read-base-move-cover.ts';
import type { CoverRequest } from './read-base-move-cover.ts';
import { readPRPatchID } from './read-pr-patch-id.ts';

// A repo where the PR's branch was reviewed at `reviewed` on base `oldBase`, then rebased onto
// `newBase` as `head` with the same diff; and an empty hq database with a way to record a review.
async function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-base-move-cover-'));
  const db = openDb(join(base, 'hq.db'));
  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  const repo = await createGitRepo(join(base, 'repo'));
  const oldBase = await repo.commit({ 'kettle.txt': 'boil\n' }, 'start');
  await repo.git('checkout', '-q', '-b', 'pour');
  const reviewed = await repo.commit({ 'pour.txt': 'pour\n  slowly\n' }, 'pour');
  await repo.git('checkout', '-q', 'main');
  const newBase = await repo.commit({ 'lid.txt': 'lid\n' }, 'main moves on');
  await repo.git('checkout', '-q', 'pour');
  await repo.git('rebase', '-q', 'main');
  const head = await repo.git('rev-parse', 'HEAD');
  const readID = await readPRPatchID(realRunner, repo.directory, oldBase, reviewed);
  const patchId = readID ?? '';
  const insert = db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, depth, special, findings, sha, confirm, base_move, patch_id) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, ?, ?, 'light', 'none', '[]', 'x', ?, ?, ?)");
  return {
    db,
    repo,
    oldBase,
    newBase,
    reviewed,
    head,
    patchId,
    recordReview: (round: CoverRow) => insert.run(round.head, round.base, round.confirm, round.base_move, round.patch_id),
    request: (heads: Pick<CoverRequest, 'summaryHead' | 'head' | 'baseNow'>) => ({ db, run: realRunner, repo: 'widgets', pr: 7, ...heads, checkout: () => Promise.resolve(repo.directory) }),
  };
}

test("it covers the head when hq recorded a base move with the reviewed diff and git's patch-ids agree", async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: ctx.reviewed, base: ctx.oldBase, confirm: 0, base_move: 0, patch_id: ctx.patchId });
  ctx.recordReview({ head: ctx.head, base: ctx.newBase, confirm: 1, base_move: 1, patch_id: ctx.patchId });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: ctx.reviewed, head: ctx.head, baseNow: ctx.newBase }));

  expect(cover).toStrictEqual({ covered: true, reviewed: ctx.reviewed });
});

test("it refuses when the recorded patch-ids match but git's patch-id of the head now differs", async () => {
  const ctx = await setupTest();
  const changed = await ctx.repo.commit({ 'pour.txt': 'pour\n    slowly\n' }, 'indent');
  ctx.recordReview({ head: ctx.reviewed, base: ctx.oldBase, confirm: 0, base_move: 0, patch_id: ctx.patchId });
  ctx.recordReview({ head: changed, base: ctx.newBase, confirm: 1, base_move: 1, patch_id: ctx.patchId });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: ctx.reviewed, head: changed, baseNow: ctx.newBase }));

  expect(cover).toMatchObject({ covered: false, why: expect.stringContaining("git's patch-ids now do not match") });
});

test('it refuses when the patch-id recorded at the head is not the reviewed one', async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: ctx.reviewed, base: ctx.oldBase, confirm: 0, base_move: 0, patch_id: ctx.patchId });
  ctx.recordReview({ head: ctx.head, base: ctx.newBase, confirm: 1, base_move: 1, patch_id: 'f'.repeat(40) });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: ctx.reviewed, head: ctx.head, baseNow: ctx.newBase }));

  expect(cover).toStrictEqual({ covered: false, why: `the diff recorded at ${ctx.head.slice(0, 7)} is not the one reviewed at ${ctx.reviewed.slice(0, 7)}` });
});

test('it refuses when the base move was recorded at another head', async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: ctx.reviewed, base: ctx.oldBase, confirm: 0, base_move: 0, patch_id: ctx.patchId });
  ctx.recordReview({ head: ctx.newBase, base: ctx.oldBase, confirm: 1, base_move: 1, patch_id: ctx.patchId });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: ctx.reviewed, head: ctx.head, baseNow: ctx.newBase }));

  expect(cover).toStrictEqual({ covered: false, why: `hq has no base-move run recorded at ${ctx.head.slice(0, 7)}` });
});

test('it refuses when hq recorded no review of the PR', async () => {
  const ctx = await setupTest();

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: ctx.reviewed, head: ctx.head, baseNow: ctx.newBase }));

  expect(cover).toStrictEqual({ covered: false, why: `hq has no base-move run recorded at ${ctx.head.slice(0, 7)}` });
});

test('it refuses when hq cannot make a checkout to recompute the patch-ids in', async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: ctx.reviewed, base: ctx.oldBase, confirm: 0, base_move: 0, patch_id: ctx.patchId });
  ctx.recordReview({ head: ctx.head, base: ctx.newBase, confirm: 1, base_move: 1, patch_id: ctx.patchId });

  const cover = await readBaseMoveCover({ ...ctx.request({ summaryHead: ctx.reviewed, head: ctx.head, baseNow: ctx.newBase }), checkout: () => Promise.reject(new Error('no clone')) });

  expect(cover).toStrictEqual({ covered: false, why: 'hq has no checkout of the repo to recompute the patch-ids in' });
});
