import { expect, onTestFinished, test } from 'bun:test';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closeGitHubRunPRs } from './close-github-run-prs.ts';
import { closePr } from './close-pr.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it marks a merged PR merged with GitHub\'s time and merge commit, by hq-github, and moves the run on', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({
    views: { 'kettle#5': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05.678Z', mergeCommit: { oid: '0123456789abcdef0123456789abcdef01234567' } }) },
    calls,
  });

  const result = await closeGitHubRunPRs(ctx.db, gh);

  expect(result).toStrictEqual({ closed: ['kettle#5'], errors: [] });
  expect(calls).toStrictEqual(['gh pr view 5 -R zgeoff/kettle --json state,mergedAt,mergeCommit']);
  expect(ctx.db.query("SELECT state, merged_at, merge_sha FROM run_prs WHERE ref = 'kettle#5'").get()).toStrictEqual({
    state: 'merged',
    merged_at: '2026-10-20T03:04:05Z',
    merge_sha: '0123456789abcdef0123456789abcdef01234567',
  });
  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-9801'").get()).toStrictEqual({ state: 'merged' });
  expect(ctx.db.query("SELECT actor FROM events WHERE action = 'merged'").all()).toStrictEqual([{ actor: 'hq-github' }]);
});

test('it marks a merged PR with no usable merge commit merged, with no sha', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#5': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05Z', mergeCommit: { oid: 'NOT-A-SHA' } }) } });

  await closeGitHubRunPRs(ctx.db, gh);

  expect(ctx.db.query("SELECT state, merge_sha FROM run_prs WHERE ref = 'kettle#5'").get()).toStrictEqual({ state: 'merged', merge_sha: null });
});

test('it marks a closed PR closed, and the run does not move to merged', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#5': JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) } });

  const result = await closeGitHubRunPRs(ctx.db, gh);

  expect(result).toStrictEqual({ closed: ['kettle#5'], errors: [] });
  expect(ctx.db.query("SELECT state, merged_at FROM run_prs WHERE ref = 'kettle#5'").get()).toStrictEqual({ state: 'closed', merged_at: null });
  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-9801'").get()).toStrictEqual({ state: 'working' });
  expect(ctx.db.query("SELECT actor FROM events WHERE action = 'closed'").all()).toStrictEqual([{ actor: 'hq-github' }]);
});

test('it leaves an open PR alone', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#5': JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null }) } });

  const result = await closeGitHubRunPRs(ctx.db, gh);

  expect(result).toStrictEqual({ closed: [], errors: [] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#5'").get()).toStrictEqual({ state: 'open' });
});

test('it reports an answer with no state and leaves the PR open', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#5': '{}' } });

  const result = await closeGitHubRunPRs(ctx.db, gh);

  expect(result).toStrictEqual({ closed: [], errors: ['kettle#5: gh gave no state'] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#5'").get()).toStrictEqual({ state: 'open' });
});

test('it reports a failed gh call and an unreadable answer, leaves their rows open, and still moves the other PRs', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  addPr(ctx.db, 'GEO-9801', 'kettle#6', 'kettle-bot');
  addPr(ctx.db, 'GEO-9801', 'kettle#7', 'kettle-bot');
  addPr(ctx.db, 'GEO-9801', 'kettle#8', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({
    views: {
      'kettle#6': 'not json at all',
      'kettle#7': JSON.stringify({ state: 'MERGED', mergedAt: 'last tuesday', mergeCommit: null }),
      'kettle#8': JSON.stringify({ state: 'CLOSED' }),
    },
  });

  const result = await closeGitHubRunPRs(ctx.db, gh);

  expect(result.closed).toStrictEqual(['kettle#8']);
  expect(result.errors).toStrictEqual(["kettle#5: can't read it (gh exit 1): invented: no such PR", 'kettle#6: gh gave no JSON', 'kettle#7: GitHub says merged but gave no merge time']);
  expect(ctx.db.query('SELECT ref, state FROM run_prs ORDER BY ref').all()).toStrictEqual([
    { ref: 'kettle#5', state: 'open' },
    { ref: 'kettle#6', state: 'open' },
    { ref: 'kettle#7', state: 'open' },
    { ref: 'kettle#8', state: 'closed' },
  ]);
});

test('it leaves a row closed by hand while gh was asked alone, with no error', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  const gh = buildStubGitHubFactsRunner({
    views: { 'kettle#5': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05Z', mergeCommit: null }) },
    onView: () => closePr(ctx.db, 'kettle#5', { to: 'closed', actor: 'kettle-bot' }),
  });

  const result = await closeGitHubRunPRs(ctx.db, gh);

  expect(result).toStrictEqual({ closed: [], errors: [] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#5'").get()).toStrictEqual({ state: 'closed' });
});

test('it never asks about a PR that is already merged or closed, or belongs to a dropped run', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9801', 'kettle#5', 'kettle-bot');
  addPr(ctx.db, 'GEO-9801', 'kettle#6', 'kettle-bot');
  closePr(ctx.db, 'kettle#5', { to: 'merged', actor: 'kettle-bot' });
  addRun(ctx.db, { issue: 'GEO-9802', title: 'Invented teapot work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9802', 'teapot#2', 'kettle-bot');
  setState(ctx.db, 'GEO-9802', 'dropped', { note: 'paused' }, 'kettle-bot');

  await closeGitHubRunPRs(ctx.db, buildStubGitHubFactsRunner({ calls }));

  expect(calls).toStrictEqual(['gh pr view 6 -R zgeoff/kettle --json state,mergedAt,mergeCommit']);
});
