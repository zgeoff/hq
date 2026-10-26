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

// An empty hq database and an empty git repo, with a way to record a review of widgets#7 and to
// build the gate's request for it.
async function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-base-move-cover-'));
  const db = openDb(join(base, 'hq.db'));
  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  const repo = await createGitRepo(join(base, 'repo'));
  const insert = db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, depth, special, findings, sha, confirm, base_move, patch_id) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, ?, ?, 'light', 'none', '[]', 'x', ?, ?, ?)");
  return {
    repo,
    recordReview: (round: CoverRow) => insert.run(round.head, round.base, round.confirm, round.base_move, round.patch_id),
    request: (heads: Pick<CoverRequest, 'summaryHead' | 'head' | 'baseNow'>): CoverRequest => ({ db, run: realRunner, repo: 'widgets', pr: 7, ...heads, checkout: () => Promise.resolve(repo.directory) }),
  };
}

test("it covers the head when hq recorded a base move with the reviewed diff and git's patch-ids agree", async () => {
  const ctx = await setupTest();
  const oldBase = await ctx.repo.commit({ 'kettle.txt': 'boil\n' }, 'start');
  await ctx.repo.git('checkout', '-q', '-b', 'pour');
  const reviewed = await ctx.repo.commit({ 'pour.txt': 'pour\n  slowly\n' }, 'pour');
  await ctx.repo.git('checkout', '-q', 'main');
  const newBase = await ctx.repo.commit({ 'lid.txt': 'lid\n' }, 'main moves on');
  await ctx.repo.git('checkout', '-q', 'pour');
  await ctx.repo.git('rebase', '-q', 'main');
  const head = await ctx.repo.git('rev-parse', 'HEAD');
  const patchId = await readPRPatchID(realRunner, ctx.repo.directory, oldBase, reviewed);
  ctx.recordReview({ head: reviewed, base: oldBase, confirm: 0, base_move: 0, patch_id: patchId });
  ctx.recordReview({ head, base: newBase, confirm: 1, base_move: 1, patch_id: patchId });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: reviewed, head, baseNow: newBase }));

  expect(cover).toStrictEqual({ covered: true, reviewed });
});

test("it refuses when the recorded patch-ids match but git's patch-id of the head now differs", async () => {
  const ctx = await setupTest();
  const oldBase = await ctx.repo.commit({ 'kettle.txt': 'boil\n' }, 'start');
  await ctx.repo.git('checkout', '-q', '-b', 'pour');
  const reviewed = await ctx.repo.commit({ 'pour.txt': 'pour\n  slowly\n' }, 'pour');
  const reindented = await ctx.repo.commit({ 'pour.txt': 'pour\n    slowly\n' }, 'indent');
  const patchId = await readPRPatchID(realRunner, ctx.repo.directory, oldBase, reviewed);
  ctx.recordReview({ head: reviewed, base: oldBase, confirm: 0, base_move: 0, patch_id: patchId });
  ctx.recordReview({ head: reindented, base: oldBase, confirm: 1, base_move: 1, patch_id: patchId });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: reviewed, head: reindented, baseNow: oldBase }));

  expect(cover).toMatchObject({ covered: false, why: expect.stringContaining("git's patch-ids now do not match") });
});

test('it refuses when the patch-id recorded at the head is not the reviewed one', async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: 'a'.repeat(40), base: 'c'.repeat(40), confirm: 0, base_move: 0, patch_id: '1'.repeat(40) });
  ctx.recordReview({ head: 'b'.repeat(40), base: 'd'.repeat(40), confirm: 1, base_move: 1, patch_id: '2'.repeat(40) });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: 'a'.repeat(40), head: 'b'.repeat(40), baseNow: 'd'.repeat(40) }));

  expect(cover).toStrictEqual({ covered: false, why: 'the diff recorded at bbbbbbb is not the one reviewed at aaaaaaa' });
});

test('it refuses when the base move was recorded at another head', async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: 'a'.repeat(40), base: 'c'.repeat(40), confirm: 0, base_move: 0, patch_id: '1'.repeat(40) });
  ctx.recordReview({ head: 'e'.repeat(40), base: 'd'.repeat(40), confirm: 1, base_move: 1, patch_id: '1'.repeat(40) });

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: 'a'.repeat(40), head: 'b'.repeat(40), baseNow: 'd'.repeat(40) }));

  expect(cover).toStrictEqual({ covered: false, why: 'hq has no base-move run recorded at bbbbbbb' });
});

test('it refuses when hq recorded no review of the PR', async () => {
  const ctx = await setupTest();

  const cover = await readBaseMoveCover(ctx.request({ summaryHead: 'a'.repeat(40), head: 'b'.repeat(40), baseNow: 'd'.repeat(40) }));

  expect(cover).toStrictEqual({ covered: false, why: 'hq has no base-move run recorded at bbbbbbb' });
});

test('it refuses when hq cannot make a checkout to recompute the patch-ids in', async () => {
  const ctx = await setupTest();
  ctx.recordReview({ head: 'a'.repeat(40), base: 'c'.repeat(40), confirm: 0, base_move: 0, patch_id: '1'.repeat(40) });
  ctx.recordReview({ head: 'b'.repeat(40), base: 'd'.repeat(40), confirm: 1, base_move: 1, patch_id: '1'.repeat(40) });

  const cover = await readBaseMoveCover({ ...ctx.request({ summaryHead: 'a'.repeat(40), head: 'b'.repeat(40), baseNow: 'd'.repeat(40) }), checkout: () => Promise.reject(new Error('no clone')) });

  expect(cover).toStrictEqual({ covered: false, why: 'hq has no checkout of the repo to recompute the patch-ids in' });
});
