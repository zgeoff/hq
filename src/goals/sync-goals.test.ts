import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import invariant from 'tiny-invariant';
import { overrideEnv } from '../config/override-env.ts';
import { readDeployRuns } from './read-deploy-runs.ts';
import { readGoalDays } from './read-goal-days.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { classifyDeploy } from './classify-deploy.ts';
import { DEPLOY } from './deploy.ts';
import { goalLine } from './goal-line.ts';
import { goalRows } from './goal-rows.ts';
import { loadRepos } from './load-repos.ts';
import { syncClosedDay } from './sync-closed-day.ts';
import { syncDeploys } from './sync-deploys.ts';
import { syncGoals } from './sync-goals.ts';
import { syncRunsDay } from './sync-runs-day.ts';
import type { Runner } from '../runner/types.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { IN_SCOPE } from '../scope/in-scope.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  updateEnv('HOME', base.dir);
  at('2026-10-16T02:00:00Z');

  return { db: base.db, directory: base.dir, seed: buildSeeder(base) };
}

const run = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  created_at: '2026-10-14T03:00:00Z',
  run_started_at: '2026-10-14T03:00:00Z',
  updated_at: '2026-10-14T03:10:00Z',
  ...over,
});

function gh(runs: Record<string, ReturnType<typeof run>[]>, closed: Record<string, { number: number; closed_at: string; repo: string }[]> = {}, repos = ['atc', 'cloud']): Runner {
  return async (cmd) => {
    if (cmd[1] === 'repo') return { code: 0, stdout: JSON.stringify(repos.map((name) => ({ name, isArchived: false })).concat([{ name: 'old', isArchived: true }])), stderr: '' };
    const path = cmd.find((c) => c.startsWith('repos/'));
    if (path?.includes('/jobs?')) return { code: 0, stdout: JSON.stringify({ total_count: 1, jobs: [{ name: 'apply', conclusion: 'success', steps: [] }] }), stderr: '' };
    if (path) {
      const m = /repos\/zgeoff\/([^/]+)\/actions\/runs\?created=(\d{4}-\d{2}-\d{2})/.exec(path)!;
      const rs = runs[`${m[1]}/${m[2]}`] ?? [];
      return { code: 0, stdout: JSON.stringify({ total_count: rs.length, workflow_runs: rs }), stderr: '' };
    }
    const q = cmd.find((c) => c.startsWith('q='))!;
    const day = /closed:(\d{4}-\d{2}-\d{2})/.exec(q)![1]!;
    const items = (closed[day] ?? []).map((c) => ({ number: c.number, closed_at: c.closed_at, repository_url: `https://api.github.com/repos/zgeoff/${c.repo}` }));
    return { code: 0, stdout: JSON.stringify([{ total_count: items.length, incomplete_results: false, items }]), stderr: '' };
  };
}

test('a past day of runs is fetched once; a day with a run still going is fetched again', async () => {
  const ctx = setupTest();
  const runs = {
    'atc/2026-10-14': [run({ id: 1 }), run({ id: 2, conclusion: 'failure', run_attempt: 2 })],
    'cloud/2026-10-14': [run({ id: 3, path: DEPLOY.path, status: 'in_progress', conclusion: null, updated_at: '2026-10-14T03:05:00Z' })],
  };
  const atcRuns = await syncRunsDay(ctx.db, gh(runs), 'atc', '2026-10-14');
  expect(atcRuns).toBe(2);
  const cloudRuns = await syncRunsDay(ctx.db, gh(runs), 'cloud', '2026-10-14');
  expect(cloudRuns).toBe(1);
  expect(ctx.db.query('SELECT kind, key, day, n AS count FROM goal_days ORDER BY key').all()).toStrictEqual([{ kind: 'ci', key: 'atc', day: '2026-10-14', count: 2 }]);
  runs['cloud/2026-10-14'] = [run({ id: 3, path: DEPLOY.path, conclusion: 'failure' })];
  await syncRunsDay(ctx.db, gh(runs), 'cloud', '2026-10-14');
  expect(ctx.db.query('SELECT status, conclusion FROM ci_runs WHERE id = 3').get()).toStrictEqual({ status: 'completed', conclusion: 'failure' });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM goal_days').get()).toStrictEqual({ count: 2 });
});

test.each([
  [{ id: 0 }],
  [{ id: 'x' }],
  [{ run_attempt: 0 }],
  [{ created_at: '2026-10-13T23:00:00Z' }],
  [{ created_at: 'soon' }],
  [{ updated_at: '0' }],
  [{ conclusion: 7 }],
  [{ path: null }],
])('a run hq cannot read refuses the whole day: %p', async (bad) => {
  const ctx = setupTest();
  const runner = gh({ 'atc/2026-10-14': [run({ id: 9 }), run(bad)] });
  await expect(syncRunsDay(ctx.db, runner, 'atc', '2026-10-14')).rejects.toThrow("can't read");
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM ci_runs').get()).toStrictEqual({ count: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM goal_days').get()).toStrictEqual({ count: 0 });
});

test('a day with over 1000 runs is fetched in smaller windows, each under the API limit', async () => {
  const ctx = setupTest();
  // 1,200 invented runs, 50 an hour: the whole day is over the limit, each half is not.
  const all = Array.from({ length: 1200 }, (_, i) => run({ id: i + 1, created_at: `2026-10-14T${String(Math.floor(i / 50)).padStart(2, '0')}:${String(i % 50).padStart(2, '0')}:00Z` }));
  const ranges: string[] = [];
  const windowed: Runner = async (cmd) => {
    const path = cmd.find((c) => c.startsWith('repos/'))!;
    const [, from, to] = /created=([^.]+)\.\.([^&]+)/.exec(path)!;
    const page = Number(/[?&]page=(\d+)/.exec(path)![1]);
    if (page === 1) ranges.push(`${from}..${to}`);
    const inRange = all.filter((r) => r.created_at >= from! && r.created_at <= to!);
    return { code: 0, stdout: JSON.stringify({ total_count: inRange.length, workflow_runs: inRange.slice((page - 1) * 100, page * 100) }), stderr: '' };
  };
  const stored = await syncRunsDay(ctx.db, windowed, 'atc', '2026-10-14');
  expect(stored).toBe(1200);
  expect(ranges).toStrictEqual(['2026-10-14T00:00:00Z..2026-10-14T23:59:59Z', '2026-10-14T00:00:00Z..2026-10-14T11:59:59Z', '2026-10-14T12:00:00Z..2026-10-14T23:59:59Z']);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM ci_runs').get()).toStrictEqual({ count: 1200 });
});

test('over 1000 runs in one hour, or a bad repo name, records nothing', async () => {
  const ctx = setupTest();
  const many: Runner = async () => ({ code: 0, stdout: JSON.stringify({ total_count: 1001, workflow_runs: [] }), stderr: '' });
  await expect(syncRunsDay(ctx.db, many, 'atc', '2026-10-14')).rejects.toThrow('runs in the hour from 2026-10-14T00:00:00Z, more than the API lists');
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM ci_runs').get()).toStrictEqual({ count: 0 });
  await expect(syncRunsDay(ctx.db, many, '../x', '2026-10-14')).rejects.toThrow('bad repo name');
  await expect(syncRunsDay(ctx.db, many, '..', '2026-10-14')).rejects.toThrow('bad repo name');
  for (const total_count of [-1, 1.5, '3']) {
    const odd: Runner = async () => ({ code: 0, stdout: JSON.stringify({ total_count, workflow_runs: [] }), stderr: '' });
    await expect(syncRunsDay(ctx.db, odd, 'atc', '2026-10-14')).rejects.toThrow('not a run list');
  }
});

test('closed-unmerged PRs: stored once per past day; a bad row refuses the day', async () => {
  const ctx = setupTest();
  const closed = { '2026-10-14': [{ repo: 'atc', number: 5, closed_at: '2026-10-14T05:00:00Z' }] };
  const stored = await syncClosedDay(ctx.db, gh({}, closed), '2026-10-14');
  expect(stored).toBe(1);
  expect(ctx.db.query(`SELECT COUNT(*) AS count FROM goal_days WHERE kind = 'closed'`).get()).toStrictEqual({ count: 1 });
  for (const bad of [{ repo: '..', number: 6, closed_at: '2026-10-14T05:00:00Z' }, { repo: 'atc', number: 0, closed_at: '2026-10-14T05:00:00Z' }, { repo: 'atc', number: 7, closed_at: '2026-10-13T05:00:00Z' }]) {
    await expect(syncClosedDay(ctx.db, gh({}, { '2026-10-15': [bad] }), '2026-10-15')).rejects.toThrow("can't read");
  }
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM closed_prs').get()).toStrictEqual({ count: 1 });
});

test('the rows: Sydney days and weeks; deploys and log are n/a before their sources begin', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_STATE_DIR', `${ctx.directory}/.local/share/z-sessions`));
  mkdirSync(`${ctx.directory}/.local/share/z-sessions`, { recursive: true });
  writeFileSync(`${ctx.directory}/.local/share/z-sessions/delivery.md`, '- 2026-10-14T01:00Z DEPLOY cloud\n- 01:30Z HOLD nixie\n');
  const runs = {
    'atc/2026-10-13': [run({ id: 1, created_at: '2026-10-13T12:00:00Z', run_started_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:20:00Z' })],
    'atc/2026-10-14': [run({ id: 2, conclusion: 'cancelled' }), run({ id: 3, conclusion: 'failure', run_attempt: 3 })],
    'cloud/2026-10-14': [run({ id: 4, path: DEPLOY.path }), run({ id: 5, path: DEPLOY.path, conclusion: 'failure' })],
  };
  const result = await syncGoals(ctx.db, gh(runs, { '2026-10-14': [{ repo: 'atc', number: 8, closed_at: '2026-10-14T04:00:00Z' }] }), { from: new Date('2026-10-12T00:00:00Z') });
  expect(result.errors).toStrictEqual([]);
  expect(result.runs).toBe(5);
  ctx.seed.mergedPR({ repo: 'atc', number: 1, merged_at: '2026-10-14T02:00:00Z', title: 'fix: x', kind: 'fix' });
  const rows = goalRows(ctx.db, 4);
  const [tue, wed, thu, fri] = rows.days;
  expect(tue).toMatchObject({ label: 'Tue 13 Oct', deploys: null, log: null, ci: { runs: 1, minutes: 20 } });
  expect(wed).toMatchObject({ label: 'Wed 14 Oct', deploys: { runs: 2, ok: 1, failed: 1, applied_ok: 2, held: 0, unclassified: 0 }, log: { deploy: 1, hold: 1 }, ci: { runs: 4, failed: 2, cancelled: 1, reruns: 1, minutes: 40, wasteMinutes: 30, missing: 0 }, merged: 1, closedUnmerged: 1 });
  expect(thu).toMatchObject({ deploys: { runs: 0 }, ci: { runs: 0 } });
  expect(fri).toMatchObject({ label: 'Fri 16 Oct', partial: true });
  expect(rows.weeks.map((week) => week.label)).toStrictEqual(['week of 05 Oct', 'week of 12 Oct']);
  expect(rows.weeks[1]).toMatchObject({ partial: true, ci: { runs: 5 } });
  invariant(wed);
  expect(goalLine(wed)).toContain('deploy-prod 2 runs (applies 2 ok, 0 failed; 0 held, 0 no-apply); log DEPLOY/HOLD 1/1; CI 4 runs, 2 failed (50%), 1 cancelled (25%), 1 re-run, 40 min, 30 in failed or cancelled (75%)');
});

test('stored rows of a repo now out of scope stay in the database but count nowhere', async () => {
  const ctx = setupTest();
  const runs = { 'atc/2026-10-14': [run({ id: 2 })] };
  await syncGoals(ctx.db, gh(runs, { '2026-10-14': [] }), { from: new Date('2026-10-12T00:00:00Z') });
  ctx.seed.ciRun({ id: 99, repo: 'teapots', path: 'ci.yml', conclusion: 'failure', created_at: '2026-10-14T01:00:00Z', started_at: '2026-10-14T01:00:00Z', updated_at: '2026-10-14T01:30:00Z' });
  ctx.seed.mergedPR({ repo: 'teapots', number: 3, merged_at: '2026-10-14T02:00:00Z', title: 'fix: y', kind: 'fix' });
  ctx.db.query(`INSERT INTO closed_prs (repo, number, closed_at) VALUES ('teapots', 4, '2026-10-14T03:00:00Z')`).run();
  ctx.db.query(`INSERT INTO goal_days (kind, key, day, n, at) VALUES ('ci', 'teapots', '2026-10-12', 1, '2026-10-12T23:00:00Z')`).run();
  const [, wed] = goalRows(ctx.db, 4).days;
  expect(wed).toMatchObject({ label: 'Wed 14 Oct', ci: { runs: 1, failed: 0, missing: 0 }, merged: 0, closedUnmerged: 0 });
  expect(ctx.db.query(`SELECT COUNT(*) AS count FROM ci_runs WHERE repo = 'teapots'`).get()).toStrictEqual({ count: 1 });
});

test('a capped sync fetches the newest repo-days first and counts the rest as left', async () => {
  const ctx = setupTest();
  const result = await syncGoals(ctx.db, gh({}, {}), { from: new Date('2026-10-12T00:00:00Z'), maxRepoDays: 3 });
  expect(result.days).toBe(3);
  expect(result.errors).toStrictEqual([]);
  expect(result.left).toBe(2 * 5 - 3);
  const got = readGoalDays(ctx.db, 'ci');
  expect(got.every((x) => x.day === '2026-10-15')).toBe(true);
  const again = await syncGoals(ctx.db, gh({}, {}), { from: new Date('2026-10-12T00:00:00Z') });
  expect(again.left).toBe(0);
});

test.each([
  [{ incomplete_results: true }, 'incomplete'],
  [{}, 'incomplete'],
  [{ incomplete_results: false, total_count: -1 }, 'not a search page'],
  [{ incomplete_results: false, total_count: 0.5 }, 'not a search page'],
])('a search page %p is not stored, and the day stays open', async (over, why) => {
  const ctx = setupTest();
  const page = { total_count: 1, items: [{ number: 5, closed_at: '2026-10-14T05:00:00Z', repository_url: 'https://api.github.com/repos/zgeoff/atc' }], ...over };
  const runner: Runner = () => Promise.resolve({ code: 0, stdout: JSON.stringify([page]), stderr: '' });
  await expect(syncClosedDay(ctx.db, runner, '2026-10-14')).rejects.toThrow(why);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM closed_prs').get()).toStrictEqual({ count: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM goal_days').get()).toStrictEqual({ count: 0 });
});

test('it takes no new repo-day once the sync is aborted', async () => {
  const ctx = setupTest();
  const abandon = new AbortController();
  const answer = gh({}, {}, IN_SCOPE);
  const fetched: string[] = [];
  const runner: Runner = (cmd, opts) => {
    const path = cmd.find((part) => part.includes('/actions/runs?'));
    if (path) {
      fetched.push(path);
      abandon.abort();
    }
    return answer(cmd, opts);
  };

  const stopped = await syncGoals(ctx.db, runner, { from: new Date('2026-10-02T00:00:00Z'), signal: abandon.signal }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(stopped).toMatchObject({ name: 'AbortError' });
  expect(fetched.length).toBeLessThanOrEqual(4);
});

test('loadRepos() keeps only the repos in scope, and the list matches repo-facts.md', async () => {
  const doc = await Bun.file(`${import.meta.dir}/../../docs/skill-development/repo-facts.md`).text();
  const scoped = await loadRepos(() => Promise.resolve({ code: 0, stdout: JSON.stringify([{ name: 'atc', isArchived: false }, { name: 'decree', isArchived: false }, { name: 'brand-new', isArchived: false }]), stderr: '' }));
  expect(scoped).toEqual(['atc']);
  const section = doc.split('## repos in scope')[1]!.split('\n## ')[0]!;
  const inList = section.split(/^In:\s*$/m)[1]!.split(/^(?!- |\s*$)/m)[0]!;
  const listed = [...inList.matchAll(/^- `zgeoff\/([A-Za-z0-9_.-]+)`\s*$/gm)].map((m) => m[1]);
  expect(listed.length).toBeGreaterThan(0);
  expect(listed).toEqual(IN_SCOPE);
});

test('closed-unmerged PRs in a repo not in scope are not stored', async () => {
  const ctx = setupTest();
  const closed = { '2026-10-14': [{ repo: 'atc', number: 5, closed_at: '2026-10-14T05:00:00Z' }, { repo: 'decree', number: 9, closed_at: '2026-10-14T06:00:00Z' }] };
  const stored = await syncClosedDay(ctx.db, gh({}, closed), '2026-10-14');
  expect(stored).toBe(1);
  expect(ctx.db.query('SELECT repo FROM closed_prs').all()).toStrictEqual([{ repo: 'atc' }]);
});

const job = (name: string, conclusion: string | null, steps: { name: string; conclusion: string }[] = []) => ({ name, conclusion, steps });
const jobsOf = (...jobs: ReturnType<typeof job>[]) => ({ total_count: jobs.length, jobs });
const HOLD = 'Hold for a manual dispatch';

test('classify a deploy-prod run from its jobs', () => {
  const one = (jobs: unknown, run: string | null = 'success') => classifyDeploy(jobs, run);
  expect(one(jobsOf(job('decide', 'success'), job('apply', 'skipped'), job('alert', 'skipped')))).toMatchObject({ outcome: 'no_apply', apply_conclusion: 'skipped' });
  expect(one(jobsOf(job('decide', 'success')))).toMatchObject({ outcome: 'no_apply', apply_conclusion: null });
  expect(one(jobsOf(job('decide', 'success'), job('apply', 'success', [{ name: 'Apply', conclusion: 'success' }])))).toMatchObject({ outcome: 'applied_ok' });
  const decideAgain = jobsOf(job('decide', 'success'), job('apply', 'success', [{ name: 'Decide again', conclusion: 'success' }, { name: 'Apply', conclusion: 'skipped' }]));
  expect(one(decideAgain)).toMatchObject({ outcome: 'no_apply', apply_conclusion: 'success' });
  expect(one(jobsOf(job('apply', 'failure', [{ name: 'Set up', conclusion: 'success' }, { name: HOLD, conclusion: 'failure' }])), 'failure')).toEqual({ outcome: 'held', apply_conclusion: 'failure', failed_step: HOLD });
  expect(one(jobsOf(job('apply', 'failure', [{ name: 'Terraform apply', conclusion: 'failure' }])), 'failure')).toEqual({ outcome: 'applied_failed', apply_conclusion: 'failure', failed_step: 'Terraform apply' });
  const holdAgain = jobsOf(job('apply', 'failure', [{ name: `${HOLD} again`, conclusion: 'failure' }]));
  expect(one(holdAgain, 'failure')).toMatchObject({ outcome: 'applied_failed' });
  expect(one(jobsOf(job('apply', 'timed_out')), 'failure')).toMatchObject({ outcome: 'applied_failed', failed_step: null });
  expect(one(jobsOf(job('apply', 'cancelled')), 'cancelled')).toMatchObject({ outcome: 'cancelled' });
  expect(one(jobsOf(job('decide', 'cancelled'), job('apply', 'skipped')), 'cancelled')).toMatchObject({ outcome: 'cancelled' });
  expect(one(jobsOf(job('apply', 'neutral')))).toMatchObject({ outcome: 'unknown' });
  expect(one(null)).toBeNull();
  expect(one({ jobs: 'x' })).toBeNull();
  expect(one({ total_count: 150, jobs: [job('decide', 'success')] })).toBeNull();
  const noConclusion = jobsOf(job('apply', null));
  expect(one(noConclusion)).toBeNull();
});

test('it classifies a deploy-prod run whose steps include entries that are not objects', () => {
  const steps = [null, 7, { name: 'Terraform apply', conclusion: 'failure' }];
  const jobs = { total_count: 1, jobs: [{ name: 'apply', conclusion: 'failure', steps }] };

  expect(classifyDeploy(jobs, 'failure')).toStrictEqual({ outcome: 'applied_failed', apply_conclusion: 'failure', failed_step: 'Terraform apply' });
});

test('it classifies no deploy-prod run whose job list has an entry that is not a job', () => {
  expect(classifyDeploy({ total_count: 2, jobs: [{ name: 'apply', conclusion: 'success' }, 'x'] }, 'success')).toBeNull();
});

const depRun = (id: number, over: Partial<Record<string, unknown>> = {}) => run({ id, path: DEPLOY.path, created_at: `2026-10-14T0${id % 10}:00:00Z`, ...over });

function jobsGh(answers: Record<number, unknown>, asked: number[] = []): Runner {
  return async (cmd) => {
    const m = /repos\/zgeoff\/cloud\/actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs\?per_page=100$/.exec(cmd.find((c) => c.startsWith('repos/')) ?? '');
    if (!m) return { code: 1, stdout: '', stderr: 'unexpected call' };
    const id = Number(m[1]);
    asked.push(id);
    if (answers[id] === 404) return { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
    if (!(id in answers)) return { code: 1, stdout: '', stderr: 'HTTP 502' };
    return { code: 0, stdout: JSON.stringify(answers[id]), stderr: '' };
  };
}

test('syncDeploys stores one outcome per completed run and skips one still running', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 7001, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:41Z' });
  ctx.seed.ciRun({ id: 7002, repo: 'cloud', path: DEPLOY.path, conclusion: 'failure', created_at: '2026-10-14T00:00:42Z' });
  ctx.seed.ciRun({ id: 7003, repo: 'cloud', path: DEPLOY.path, status: 'in_progress', conclusion: null, created_at: '2026-10-14T00:00:43Z' });
  const asked: number[] = [];
  const answers = {
    7001: jobsOf(job('decide', 'success'), job('apply', 'skipped')),
    7002: jobsOf(job('decide', 'success'), job('apply', 'failure', [{ name: HOLD, conclusion: 'failure' }])),
    7003: jobsOf(job('apply', 'success')),
  };
  const result = await syncDeploys(ctx.db, jobsGh(answers, asked));
  expect(result).toStrictEqual({ fetched: 2, left: 0, errors: [], oldErrors: [] });
  expect(asked.toSorted()).toStrictEqual([7001, 7002]);
  expect(ctx.db.query('SELECT run_id, outcome, apply_conclusion, failed_step FROM deploy_runs ORDER BY run_id').all()).toStrictEqual([
    { run_id: 7001, outcome: 'no_apply', apply_conclusion: 'skipped', failed_step: null },
    { run_id: 7002, outcome: 'held', apply_conclusion: 'failure', failed_step: HOLD },
  ]);
  asked.length = 0;
  await syncDeploys(ctx.db, jobsGh(answers, asked));
  expect(asked).toStrictEqual([]);
});

test('syncDeploys takes at most 60 a call, oldest first, and counts what is left', async () => {
  const ctx = setupTest();
  const answers: Record<number, unknown> = {};
  for (let i = 0; i < 65; i++) {
    const id = 8000 + i;
    ctx.seed.ciRun({ id, repo: 'cloud', path: DEPLOY.path, created_at: new Date(Date.parse('2026-10-14T00:00:00Z') + (64 - i) * 60_000).toISOString().replace('.000', '') });
    answers[id] = jobsOf(job('apply', 'success'));
  }
  const first = await syncDeploys(ctx.db, jobsGh(answers));
  expect(first).toMatchObject({ fetched: 60, left: 5 });
  const stored = readDeployRuns(ctx.db).map((deployRun) => deployRun.run_id);
  expect(stored).not.toContain(8000);
  expect(stored).not.toContain(8004);
  expect(stored).toContain(8005);
  expect(stored).toContain(8064);
  const second = await syncDeploys(ctx.db, jobsGh(answers));
  expect(second).toMatchObject({ fetched: 5, left: 0 });
});

test('an unreadable jobs answer leaves no row and an error, and the next sync tries again', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 9001, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:01Z' });
  ctx.seed.ciRun({ id: 9002, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:02Z' });
  ctx.seed.ciRun({ id: 9003, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:03Z' });
  const answers = { 9001: jobsOf(job('apply', 'success')), 9002: { total_count: 'x' } };
  const result = await syncDeploys(ctx.db, jobsGh(answers));
  expect(result.fetched).toBe(1);
  expect(result.errors).toHaveLength(2);
  expect(result.errors.join('\n')).toContain('9002');
  expect(result.errors.join('\n')).toContain('9003');
  expect(ctx.db.query('SELECT run_id FROM deploy_runs').all()).toStrictEqual([{ run_id: 9001 }]);
  const fixed = { ...answers, 9002: jobsOf(job('apply', 'skipped')), 9003: jobsOf(job('apply', 'success')) };
  const again = await syncDeploys(ctx.db, jobsGh(fixed));
  expect(again).toMatchObject({ fetched: 2, errors: [] });
});

test('syncGoals classifies the deploy-prod runs it stored, and reports the errors', async () => {
  const ctx = setupTest();
  const runs = { 'cloud/2026-10-14': [depRun(4), depRun(5, { conclusion: 'failure' })] };
  const base = gh(runs);
  const answers = { 4: jobsOf(job('apply', 'success')) };
  const jobs = jobsGh(answers);
  const both: Runner = (cmd, o) => (cmd.some((c) => c.includes('/jobs?')) ? jobs(cmd, o) : base(cmd, o));
  const result = await syncGoals(ctx.db, both, { from: new Date('2026-10-12T00:00:00Z') });
  expect(result.deployRuns).toBe(1);
  expect(result.deployLeft).toBe(0);
  expect(result.errors.some((error) => error.includes('deploy-prod run 5'))).toBe(true);
  expect(ctx.db.query('SELECT run_id, outcome FROM deploy_runs').all()).toStrictEqual([{ run_id: 4, outcome: 'applied_ok' }]);
  const [, wed] = goalRows(ctx.db, 4).days;
  expect(wed?.deploys).toMatchObject({ runs: 2, applied_ok: 1, unclassified: 1 });
});

test('a re-run with a new attempt is classified again; a stored row for an older attempt counts nowhere', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 9501, repo: 'cloud', path: DEPLOY.path, conclusion: 'failure', created_at: '2026-10-14T00:00:21Z' });
  const first = { 9501: jobsOf(job('apply', 'failure', [{ name: 'Apply', conclusion: 'failure' }])) };
  await syncDeploys(ctx.db, jobsGh(first));
  expect(ctx.db.query('SELECT outcome, attempt FROM deploy_runs').all()).toStrictEqual([{ outcome: 'applied_failed', attempt: 1 }]);
  ctx.db.query(`UPDATE ci_runs SET attempt = 2, status = 'in_progress', conclusion = NULL WHERE id = 9501`).run();
  const asked: number[] = [];
  const running = await syncDeploys(ctx.db, jobsGh({}, asked));
  expect(running).toMatchObject({ fetched: 0, errors: [] });
  expect(asked).toStrictEqual([]);
  const runningDay = goalRows(ctx.db, 4).days.find((day) => day.deploys?.runs === 1);
  expect(runningDay?.deploys).toMatchObject({ applied_failed: 0, unclassified: 0, running: 1 });
  ctx.db.query(`UPDATE ci_runs SET status = 'completed', conclusion = 'success' WHERE id = 9501`).run();
  const completedDay = goalRows(ctx.db, 4).days.find((day) => day.deploys?.runs === 1);
  expect(completedDay?.deploys).toMatchObject({ applied_failed: 0, unclassified: 1 });
  const second = { 9501: jobsOf(job('apply', 'success', [{ name: 'Apply', conclusion: 'success' }])) };
  const result = await syncDeploys(ctx.db, jobsGh(second));
  expect(result).toMatchObject({ fetched: 1, errors: [] });
  expect(ctx.db.query('SELECT outcome, attempt FROM deploy_runs').all()).toStrictEqual([{ outcome: 'applied_ok', attempt: 2 }]);
});

test('syncDeploys asks for the attempt hq stored, so a later re-run cannot stand in for it', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 9601, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:01Z' });
  ctx.db.query('UPDATE ci_runs SET attempt = 2 WHERE id = 9601').run();
  const urls: string[] = [];
  const gh: Runner = async (cmd) => {
    urls.push(cmd.find((c) => c.startsWith('repos/'))!);
    return { code: 0, stdout: JSON.stringify(jobsOf(job('apply', 'success'))), stderr: '' };
  };
  await syncDeploys(ctx.db, gh);
  expect(urls).toStrictEqual(['repos/zgeoff/cloud/actions/runs/9601/attempts/2/jobs?per_page=100']);
});

test('a run GitHub no longer has is stored as unknown; an older run that keeps failing does not hold the check-in', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 9701, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-01T00:00:00Z' });
  ctx.seed.ciRun({ id: 9702, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:00Z' });
  ctx.seed.ciRun({ id: 9703, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:01Z' });
  const answers = { 9702: 404, 9703: jobsOf(job('apply', 'success')) };
  const result = await syncDeploys(ctx.db, jobsGh(answers), undefined, undefined, 60, new Date('2026-10-10T00:00:00Z'));
  expect(result.errors).toStrictEqual([]);
  expect(result.oldErrors.length).toBe(1);
  expect(result.oldErrors[0]).toContain('9701');
  expect(ctx.db.query('SELECT run_id, outcome FROM deploy_runs ORDER BY run_id').all()).toStrictEqual([
    { run_id: 9702, outcome: 'unknown' },
    { run_id: 9703, outcome: 'applied_ok' },
  ]);
});

test('old runs that keep failing cannot take every slot: runs inside the window go first', async () => {
  const ctx = setupTest();
  for (let index = 0; index < 61; index++) {
    ctx.seed.ciRun({ id: 9800 + index, repo: 'cloud', path: DEPLOY.path, created_at: `2026-10-01T00:${String(index % 60).padStart(2, '0')}:00Z` });
  }
  ctx.seed.ciRun({ id: 9900, repo: 'cloud', path: DEPLOY.path, created_at: '2026-10-14T00:00:00Z' });
  const asked: number[] = [];
  const answers = { 9900: jobsOf(job('apply', 'success')) };
  const result = await syncDeploys(ctx.db, jobsGh(answers, asked), undefined, undefined, 60, new Date('2026-10-10T00:00:00Z'));
  expect(asked[0]).toBe(9900);
  expect(result).toMatchObject({ left: 0, errors: [] });
  expect(result.oldErrors.length).toBe(59);
  expect(ctx.db.query('SELECT outcome FROM deploy_runs WHERE run_id = 9900').get()).toStrictEqual({ outcome: 'applied_ok' });
});
