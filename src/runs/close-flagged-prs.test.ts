import { expect, onTestFinished, test } from 'bun:test';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closeFlaggedPRs } from './close-flagged-prs.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it marks a flagged PR that GitHub shows closed unmerged closed, by the sweep, and drops its alert', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  addRun(ctx.db, { issue: 'GEO-9841', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9841', 'kettle#41', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#41': JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) }, calls });

  const kept = await closeFlaggedPRs(ctx.db, gh, [
    { key: 'pr:kettle#41', fingerprint: 'final:abc1234', issue: 'GEO-9841', line: 'kettle#41 (GEO-9841) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);

  expect(kept).toStrictEqual([]);
  expect(calls).toStrictEqual(['gh pr view 41 -R zgeoff/kettle --json state,mergedAt,mergeCommit']);
  expect(ctx.db.query("SELECT state, merged_at FROM run_prs WHERE ref = 'kettle#41'").get()).toStrictEqual({ state: 'closed', merged_at: null });
  expect(ctx.db.query("SELECT actor FROM events WHERE action = 'closed'").all()).toStrictEqual([{ actor: 'sweep' }]);
});

test('it keeps the alert and leaves the PR open when gh cannot read the PR', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9842', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9842', 'kettle#42', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: {} });

  const kept = await closeFlaggedPRs(ctx.db, gh, [
    { key: 'pr:kettle#42', fingerprint: 'final:abc1234', issue: 'GEO-9842', line: 'kettle#42 (GEO-9842) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);

  expect(kept).toStrictEqual([
    { key: 'pr:kettle#42', fingerprint: 'final:abc1234', issue: 'GEO-9842', line: 'kettle#42 (GEO-9842) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#42'").get()).toStrictEqual({ state: 'open' });
});

test('it leaves a PR that GitHub shows merged open and flagged, for hq run merged', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9843', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9843', 'kettle#43', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({
    views: { 'kettle#43': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05Z', mergeCommit: { oid: '0123456789abcdef0123456789abcdef01234567' } }) },
  });

  const kept = await closeFlaggedPRs(ctx.db, gh, [
    { key: 'pr:kettle#43', fingerprint: 'final:abc1234', issue: 'GEO-9843', line: 'kettle#43 (GEO-9843) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);

  expect(kept).toStrictEqual([
    { key: 'pr:kettle#43', fingerprint: 'final:abc1234', issue: 'GEO-9843', line: 'kettle#43 (GEO-9843) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
  expect(ctx.db.query("SELECT state, merged_at FROM run_prs WHERE ref = 'kettle#43'").get()).toStrictEqual({ state: 'open', merged_at: null });
  expect(ctx.db.query("SELECT action FROM events WHERE action IN ('merged', 'closed')").all()).toStrictEqual([]);
});

test('it keeps a PR alert that GitHub shows open, and never asks gh about an alert that is not a PR\'s', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  addRun(ctx.db, { issue: 'GEO-9844', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9844', 'kettle#44', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#44': JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null }) }, calls });

  const kept = await closeFlaggedPRs(ctx.db, gh, [
    { key: 'pr:kettle#44', fingerprint: 'final:abc1234', issue: 'GEO-9844', line: 'kettle#44 (GEO-9844) final at abc1234 for 120 min, no review [from marker:kettle]' },
    { key: 'linear:GEO-9844', fingerprint: 'completed:working', issue: 'GEO-9844', line: 'GEO-9844: Done in Linear while hq has it working; check its PRs' },
  ]);

  expect(kept).toStrictEqual([
    { key: 'pr:kettle#44', fingerprint: 'final:abc1234', issue: 'GEO-9844', line: 'kettle#44 (GEO-9844) final at abc1234 for 120 min, no review [from marker:kettle]' },
    { key: 'linear:GEO-9844', fingerprint: 'completed:working', issue: 'GEO-9844', line: 'GEO-9844: Done in Linear while hq has it working; check its PRs' },
  ]);
  expect(calls).toStrictEqual(['gh pr view 44 -R zgeoff/kettle --json state,mergedAt,mergeCommit']);
});
