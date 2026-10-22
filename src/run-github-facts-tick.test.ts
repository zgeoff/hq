import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildStubGitHubFactsRunner } from '../test/build-stub-github-facts-runner.ts';
import { freshDb } from '../test/helpers.ts';
import { setMeta } from './db/set-meta.ts';
import type { Runner } from './runner/types.ts';
import { addRun } from './runs/add-run.ts';
import { runGitHubFactsTick } from './run-github-facts-tick.ts';
import { IN_SCOPE } from './scope/in-scope.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it makes no gh call for a second pass within 10 minutes, and calls again after 10 minutes', async () => {
  const ctx = setupTest();
  const gh = mock(() => Promise.resolve({ code: 0, stdout: '[]', stderr: '' }));

  const first = await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-20T01:00:00Z'));
  const callsAfterFirst = gh.mock.calls.length;
  const second = await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-20T01:09:00Z'));
  const third = await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-20T01:10:00Z'));

  expect(first).toStrictEqual({ closed: [], attached: [], errors: [] });
  expect(callsAfterFirst).toBe(2 * IN_SCOPE.length);
  expect(second).toBeNull();
  expect(third).toStrictEqual({ closed: [], attached: [], errors: [] });
  expect(gh).toHaveBeenCalledTimes(4 * IN_SCOPE.length);
});

test('the merged search reaches back a day on a first pass, and to an hour before the last pass after a long gap', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const gh = buildStubGitHubFactsRunner({ search: '[]', calls });

  await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-20T01:00:00Z'));
  await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-20T01:10:00Z'));
  await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-23T05:00:00Z'));

  const since = calls.filter((call) => call.includes('--merged-at') && call.includes('zgeoff/hq ')).map((call) => call.split(' ')[6]);
  expect(since).toStrictEqual(['>=2026-10-19T01:00:00Z', '>=2026-10-19T01:10:00Z', '>=2026-10-20T00:10:00Z']);
});

test('it keeps the merged-search position after a pass whose merged search failed, and the next pass searches from it', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const stub = buildStubGitHubFactsRunner({ search: '[]', calls });
  const failing: Runner = (cmd, opts) => (cmd.includes('--merged-at') ? Promise.resolve({ code: 1, stdout: '', stderr: 'invented: rate limited' }) : stub(cmd, opts));

  await runGitHubFactsTick(ctx.db, stub, new Date('2026-10-19T01:00:00Z'));
  await runGitHubFactsTick(ctx.db, failing, new Date('2026-10-22T01:00:00Z'));
  await runGitHubFactsTick(ctx.db, stub, new Date('2026-10-22T01:10:00Z'));

  const since = calls.filter((call) => call.includes('--merged-at') && call.includes('zgeoff/hq ')).map((call) => call.split(' ')[6]);
  expect(since).toStrictEqual(['>=2026-10-18T01:00:00Z', '>=2026-10-19T00:00:00Z']);
});

test('it keeps the window of a failed merged search when no position was recorded yet, so the next pass searches it', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const stub = buildStubGitHubFactsRunner({ search: '[]', calls });
  const failing: Runner = (cmd, opts) => (cmd.includes('--merged-at') ? Promise.resolve({ code: 1, stdout: '', stderr: 'invented: rate limited' }) : stub(cmd, opts));
  setMeta(ctx.db, 'run_prs_checked_at', '2026-10-19T01:00:00Z');

  await runGitHubFactsTick(ctx.db, failing, new Date('2026-10-22T01:00:00Z'));
  await runGitHubFactsTick(ctx.db, stub, new Date('2026-10-22T01:10:00Z'));

  const since = calls.filter((call) => call.includes('--merged-at') && call.includes('zgeoff/hq ')).map((call) => call.split(' ')[6]);
  expect(since).toStrictEqual(['>=2026-10-19T00:00:00Z']);
});

test('it moves the merged-search position after a pass whose merged search answered in full', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const stub = buildStubGitHubFactsRunner({ search: '[]', calls });

  await runGitHubFactsTick(ctx.db, stub, new Date('2026-10-19T01:00:00Z'));
  await runGitHubFactsTick(ctx.db, stub, new Date('2026-10-22T01:00:00Z'));
  await runGitHubFactsTick(ctx.db, stub, new Date('2026-10-22T01:10:00Z'));

  const since = calls.filter((call) => call.includes('--merged-at') && call.includes('zgeoff/hq ')).map((call) => call.split(' ')[6]);
  expect(since).toStrictEqual(['>=2026-10-18T01:00:00Z', '>=2026-10-19T00:00:00Z', '>=2026-10-21T01:10:00Z']);
});

test('a PR opened and merged between two passes attaches to its run and gets its merge in one pass', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9831', title: 'Invented teapot work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  const gh = buildStubGitHubFactsRunner({
    search: '[]',
    merged: JSON.stringify([{ number: 15, repository: { name: 'hq' }, author: { login: 'zgeoff' }, body: 'Fixes GEO-9831' }]),
    views: { 'hq#15': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T00:55:00Z', mergeCommit: { oid: 'b'.repeat(40) } }) },
  });

  const result = await runGitHubFactsTick(ctx.db, gh, new Date('2026-10-20T01:00:00Z'));

  expect(result).toStrictEqual({ closed: ['hq#15'], attached: ['hq#15 to GEO-9831'], errors: [] });
  expect(ctx.db.query("SELECT state, merged_at FROM run_prs WHERE ref = 'hq#15'").get()).toStrictEqual({ state: 'merged', merged_at: '2026-10-20T00:55:00Z' });
});
