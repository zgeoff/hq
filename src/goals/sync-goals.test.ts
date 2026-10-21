import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
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

let db: Database;
let dir: string;
let cleanup: () => void;
const home = process.env['HOME'];

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HOME'] = dir;
  at('2026-10-16T02:00:00Z'); // Friday 13:00 Sydney
});
afterEach(() => {
  process.env['HOME'] = home;
  cleanup();
});

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

// gh api for runs: each repo/day answers the given runs.
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
  const runs = {
    'atc/2026-10-14': [run({ id: 1 }), run({ id: 2, conclusion: 'failure', run_attempt: 2 })],
    'cloud/2026-10-14': [run({ id: 3, path: DEPLOY.path, status: 'in_progress', conclusion: null, updated_at: '2026-10-14T03:05:00Z' })],
  };
  expect(await syncRunsDay(db, gh(runs), 'atc', '2026-10-14')).toBe(2);
  expect(await syncRunsDay(db, gh(runs), 'cloud', '2026-10-14')).toBe(1);
  expect(db.query('SELECT kind, key, day, n FROM goal_days ORDER BY key').all()).toEqual([{ kind: 'ci', key: 'atc', day: '2026-10-14', n: 2 }]);
  runs['cloud/2026-10-14'] = [run({ id: 3, path: DEPLOY.path, conclusion: 'failure' })];
  await syncRunsDay(db, gh(runs), 'cloud', '2026-10-14');
  expect(db.query('SELECT status, conclusion FROM ci_runs WHERE id = 3').get()).toEqual({ status: 'completed', conclusion: 'failure' });
  expect(db.query('SELECT COUNT(*) AS n FROM goal_days').get()).toEqual({ n: 2 });
});

test.each([
  [{ id: 0 }],
  [{ id: 'x' }],
  [{ run_attempt: 0 }],
  [{ created_at: '2026-10-13T23:00:00Z' }], // another day
  [{ created_at: 'soon' }],
  [{ updated_at: '0' }],
  [{ conclusion: 7 }],
  [{ path: null }],
])('a run hq cannot read refuses the whole day: %p', async (bad) => {
  const r = gh({ 'atc/2026-10-14': [run({ id: 9 }), run(bad)] });
  await expect(syncRunsDay(db, r, 'atc', '2026-10-14')).rejects.toThrow("can't read");
  expect(db.query('SELECT COUNT(*) AS n FROM ci_runs').get()).toEqual({ n: 0 });
  expect(db.query('SELECT COUNT(*) AS n FROM goal_days').get()).toEqual({ n: 0 });
});

test('a day with over 1000 runs is fetched in smaller windows, each under the API limit', async () => {
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
  expect(await syncRunsDay(db, windowed, 'atc', '2026-10-14')).toBe(1200);
  expect(ranges).toEqual(['2026-10-14T00:00:00Z..2026-10-14T23:59:59Z', '2026-10-14T00:00:00Z..2026-10-14T11:59:59Z', '2026-10-14T12:00:00Z..2026-10-14T23:59:59Z']);
  expect(db.query('SELECT COUNT(*) AS n FROM ci_runs').get()).toEqual({ n: 1200 });
});

test('over 1000 runs in one hour, or a bad repo name, records nothing', async () => {
  const many: Runner = async () => ({ code: 0, stdout: JSON.stringify({ total_count: 1001, workflow_runs: [] }), stderr: '' });
  await expect(syncRunsDay(db, many, 'atc', '2026-10-14')).rejects.toThrow('runs in the hour from 2026-10-14T00:00:00Z, more than the API lists');
  expect(db.query('SELECT COUNT(*) AS n FROM ci_runs').get()).toEqual({ n: 0 });
  await expect(syncRunsDay(db, many, '../x', '2026-10-14')).rejects.toThrow('bad repo name');
  await expect(syncRunsDay(db, many, '..', '2026-10-14')).rejects.toThrow('bad repo name');
  for (const total_count of [-1, 1.5, '3']) {
    const odd: Runner = async () => ({ code: 0, stdout: JSON.stringify({ total_count, workflow_runs: [] }), stderr: '' });
    await expect(syncRunsDay(db, odd, 'atc', '2026-10-14')).rejects.toThrow('not a run list');
  }
});

test('closed-unmerged PRs: stored once per past day; a bad row refuses the day', async () => {
  const closed = { '2026-10-14': [{ repo: 'atc', number: 5, closed_at: '2026-10-14T05:00:00Z' }] };
  expect(await syncClosedDay(db, gh({}, closed), '2026-10-14')).toBe(1);
  expect(db.query(`SELECT COUNT(*) AS n FROM goal_days WHERE kind = 'closed'`).get()).toEqual({ n: 1 });
  for (const bad of [{ repo: '..', number: 6, closed_at: '2026-10-14T05:00:00Z' }, { repo: 'atc', number: 0, closed_at: '2026-10-14T05:00:00Z' }, { repo: 'atc', number: 7, closed_at: '2026-10-13T05:00:00Z' }]) {
    await expect(syncClosedDay(db, gh({}, { '2026-10-15': [bad] }), '2026-10-15')).rejects.toThrow("can't read");
  }
  expect(db.query('SELECT COUNT(*) AS n FROM closed_prs').get()).toEqual({ n: 1 });
});

test('the rows: Sydney days and weeks; deploys and log are n/a before their sources begin', async () => {
  mkdirSync(`${dir}/.local/share/z-sessions`, { recursive: true });
  writeFileSync(`${dir}/.local/share/z-sessions/delivery.md`, '- 2026-10-14T01:00Z DEPLOY cloud\n- 01:30Z HOLD nixie\n');
  const runs = {
    // Wed 14 Oct Sydney is 13 Oct 13:00Z to 14 Oct 13:00Z.
    'atc/2026-10-13': [run({ id: 1, created_at: '2026-10-13T12:00:00Z', run_started_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:20:00Z' })], // Tue 13 Oct 23:00 Sydney
    'atc/2026-10-14': [run({ id: 2, conclusion: 'cancelled' }), run({ id: 3, conclusion: 'failure', run_attempt: 3 })],
    'cloud/2026-10-14': [run({ id: 4, path: DEPLOY.path }), run({ id: 5, path: DEPLOY.path, conclusion: 'failure' })],
  };
  const r = await syncGoals(db, gh(runs, { '2026-10-14': [{ repo: 'atc', number: 8, closed_at: '2026-10-14T04:00:00Z' }] }), { from: new Date('2026-10-12T00:00:00Z') });
  expect(r.errors).toEqual([]);
  expect(r.runs).toBe(5); // four workers, one total
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-14T02:00:00Z', 'fix: x', 'fix', NULL)`).run();
  const g = goalRows(db, 4);
  const [tue, wed, thu, fri] = g.days;
  expect(tue).toMatchObject({ label: 'Tue 13 Oct', deploys: null, log: null, ci: { runs: 1, minutes: 20 } });
  expect(wed).toMatchObject({ label: 'Wed 14 Oct', deploys: { runs: 2, ok: 1, failed: 1, applied_ok: 2, held: 0, unclassified: 0 }, log: { deploy: 1, hold: 1 }, ci: { runs: 4, failed: 2, cancelled: 1, reruns: 1, minutes: 40, wasteMinutes: 30, missing: 0 }, merged: 1, closedUnmerged: 1 });
  expect(thu).toMatchObject({ deploys: { runs: 0 }, ci: { runs: 0 } });
  expect(fri).toMatchObject({ label: 'Fri 16 Oct', partial: true });
  expect(g.weeks.map((w) => w.label)).toEqual(['week of 05 Oct', 'week of 12 Oct']);
  expect(g.weeks[1]).toMatchObject({ partial: true, ci: { runs: 5 } });
  expect(goalLine(wed!)).toContain('deploy-prod 2 runs (applies 2 ok, 0 failed; 0 held, 0 no-apply); log DEPLOY/HOLD 1/1; CI 4 runs, 2 failed (50%), 1 cancelled (25%), 1 re-run, 40 min, 30 in failed or cancelled (75%)');
});

test('stored rows of a repo now out of scope stay in the database but count nowhere', async () => {
  const runs = { 'atc/2026-10-14': [run({ id: 2 })] };
  await syncGoals(db, gh(runs, { '2026-10-14': [] }), { from: new Date('2026-10-12T00:00:00Z') });
  // Rows from before the repo went out: a run, a merge, a closed PR, and CI fetched for one day only.
  db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (99, 'teapots', 'ci.yml', 'push', 'completed', 'failure', 1, '2026-10-14T01:00:00Z', '2026-10-14T01:00:00Z', '2026-10-14T01:30:00Z')`).run();
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('teapots', 3, '2026-10-14T02:00:00Z', 'fix: y', 'fix', NULL)`).run();
  db.query(`INSERT INTO closed_prs (repo, number, closed_at) VALUES ('teapots', 4, '2026-10-14T03:00:00Z')`).run();
  db.query(`INSERT INTO goal_days (kind, key, day, n, at) VALUES ('ci', 'teapots', '2026-10-12', 1, '2026-10-12T23:00:00Z')`).run();
  const wed = goalRows(db, 4).days[1]!;
  expect(wed).toMatchObject({ label: 'Wed 14 Oct', ci: { runs: 1, failed: 0, missing: 0 }, merged: 0, closedUnmerged: 0 });
  expect(db.query(`SELECT COUNT(*) AS count FROM ci_runs WHERE repo = 'teapots'`).get()).toEqual({ count: 1 });
});

test('a capped sync fetches the newest repo-days first and counts the rest as left', async () => {
  const r = await syncGoals(db, gh({}, {}), { from: new Date('2026-10-12T00:00:00Z'), maxRepoDays: 3 });
  expect(r.days).toBe(3);
  expect(r.errors).toEqual([]);
  expect(r.left).toBe(2 * 5 - 3); // atc and cloud, 12 to 16 Oct (today is fetched every call): 10 repo-days, 3 fetched
  const got = db.query(`SELECT day FROM goal_days WHERE kind = 'ci' ORDER BY day`).all() as { day: string }[];
  expect(got.every((x) => x.day === '2026-10-15')).toBe(true); // the newest past day; today is never marked done
  const again = await syncGoals(db, gh({}, {}), { from: new Date('2026-10-12T00:00:00Z') });
  expect(again.left).toBe(0);
});

test.each([
  [{ incomplete_results: true }, 'incomplete'],
  [{}, 'incomplete'],
  [{ incomplete_results: false, total_count: -1 }, 'not a search page'],
  [{ incomplete_results: false, total_count: 0.5 }, 'not a search page'],
])('a search page %p is not stored, and the day stays open', async (over, why) => {
  const page = { total_count: 1, items: [{ number: 5, closed_at: '2026-10-14T05:00:00Z', repository_url: 'https://api.github.com/repos/zgeoff/atc' }], ...over };
  const r: Runner = async () => ({ code: 0, stdout: JSON.stringify([page]), stderr: '' });
  await expect(syncClosedDay(db, r, '2026-10-14')).rejects.toThrow(why);
  expect(db.query('SELECT COUNT(*) AS n FROM closed_prs').get()).toEqual({ n: 0 });
  expect(db.query('SELECT COUNT(*) AS n FROM goal_days').get()).toEqual({ n: 0 });
});

test('loadRepos() keeps only the repos in scope, and the list matches repo-facts.md', async () => {
  const doc = await Bun.file(`${import.meta.dir}/../../docs/skill-development/repo-facts.md`).text(),
    scoped = await loadRepos(() => Promise.resolve({ code: 0, stdout: JSON.stringify([{ name: 'atc', isArchived: false }, { name: 'decree', isArchived: false }, { name: 'brand-new', isArchived: false }]), stderr: '' }));
  expect(scoped).toEqual(['atc']);
  const section = doc.split('## repos in scope')[1]!.split('\n## ')[0]!;
  // The bullets under "In:", up to the next line that is not a bullet or blank.
  const inList = section.split(/^In:\s*$/m)[1]!.split(/^(?!- |\s*$)/m)[0]!;
  const listed = [...inList.matchAll(/^- `zgeoff\/([A-Za-z0-9_.-]+)`\s*$/gm)].map((m) => m[1]);
  expect(listed.length).toBeGreaterThan(0);
  expect(listed).toEqual(IN_SCOPE);
});

test('closed-unmerged PRs in a repo not in scope are not stored', async () => {
  const closed = { '2026-10-14': [{ repo: 'atc', number: 5, closed_at: '2026-10-14T05:00:00Z' }, { repo: 'decree', number: 9, closed_at: '2026-10-14T06:00:00Z' }] };
  expect(await syncClosedDay(db, gh({}, closed), '2026-10-14')).toBe(1);
  expect(db.query('SELECT repo FROM closed_prs').all()).toEqual([{ repo: 'atc' }]);
});

// ---------- deploy-prod outcomes ----------

const job = (name: string, conclusion: string | null, steps: { name: string; conclusion: string }[] = []) => ({ name, conclusion, steps });
const jobsOf = (...jobs: ReturnType<typeof job>[]) => ({ total_count: jobs.length, jobs });
const HOLD = 'Hold for a manual dispatch';

test('classify a deploy-prod run from its jobs', () => {
  const one = (jobs: unknown, run: string | null = 'success') => classifyDeploy(jobs, run);
  expect(one(jobsOf(job('decide', 'success'), job('apply', 'skipped'), job('alert', 'skipped')))).toMatchObject({ outcome: 'no_apply', apply_conclusion: 'skipped' });
  expect(one(jobsOf(job('decide', 'success')))).toMatchObject({ outcome: 'no_apply', apply_conclusion: null });
  expect(one(jobsOf(job('decide', 'success'), job('apply', 'success', [{ name: 'Apply', conclusion: 'success' }])))).toMatchObject({ outcome: 'applied_ok' });
  expect(one(jobsOf(job('decide', 'success'), job('apply', 'success', [{ name: 'Decide again', conclusion: 'success' }, { name: 'Apply', conclusion: 'skipped' }])))).toMatchObject({ outcome: 'no_apply', apply_conclusion: 'success' }); // the queued decision found nothing left
  expect(one(jobsOf(job('apply', 'failure', [{ name: 'Set up', conclusion: 'success' }, { name: HOLD, conclusion: 'failure' }])), 'failure')).toEqual({ outcome: 'held', apply_conclusion: 'failure', failed_step: HOLD });
  expect(one(jobsOf(job('apply', 'failure', [{ name: 'Terraform apply', conclusion: 'failure' }])), 'failure')).toEqual({ outcome: 'applied_failed', apply_conclusion: 'failure', failed_step: 'Terraform apply' });
  expect(one(jobsOf(job('apply', 'failure', [{ name: `${HOLD} again`, conclusion: 'failure' }])), 'failure')).toMatchObject({ outcome: 'applied_failed' }); // the name must match exactly
  expect(one(jobsOf(job('apply', 'timed_out')), 'failure')).toMatchObject({ outcome: 'applied_failed', failed_step: null });
  expect(one(jobsOf(job('apply', 'cancelled')), 'cancelled')).toMatchObject({ outcome: 'cancelled' });
  expect(one(jobsOf(job('decide', 'cancelled'), job('apply', 'skipped')), 'cancelled')).toMatchObject({ outcome: 'cancelled' });
  expect(one(jobsOf(job('apply', 'neutral')))).toMatchObject({ outcome: 'unknown' });
  expect(one(null)).toBeNull();
  expect(one({ jobs: 'x' })).toBeNull();
  expect(one({ total_count: 150, jobs: [job('decide', 'success')] })).toBeNull(); // more jobs than one page
  expect(one(jobsOf(job('apply', null)))).toBeNull(); // finished run, unfinished apply
});

const depRun = (id: number, over: Partial<Record<string, unknown>> = {}) => run({ id, path: DEPLOY.path, created_at: `2026-10-14T0${id % 10}:00:00Z`, ...over });

// A runner that answers jobs calls from a table and records the run ids it was asked about.
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

function storeRun(id: number, over: Partial<{ status: string; conclusion: string | null; created: string }> = {}) {
  const o = { status: 'completed', conclusion: 'success', created: `2026-10-14T00:00:${String(id % 60).padStart(2, '0')}Z`, ...over };
  db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, 'cloud', ?, 'push', ?, ?, 1, ?, ?, ?)`).run(id, DEPLOY.path, o.status, o.conclusion, o.created, o.created, o.created);
}

test('syncDeploys stores one outcome per completed run and skips one still running', async () => {
  storeRun(7001);
  storeRun(7002, { conclusion: 'failure' });
  storeRun(7003, { status: 'in_progress', conclusion: null });
  const asked: number[] = [];
  const answers = {
    7001: jobsOf(job('decide', 'success'), job('apply', 'skipped')),
    7002: jobsOf(job('decide', 'success'), job('apply', 'failure', [{ name: HOLD, conclusion: 'failure' }])),
    7003: jobsOf(job('apply', 'success')),
  };
  const r = await syncDeploys(db, jobsGh(answers, asked));
  expect(r).toEqual({ fetched: 2, left: 0, errors: [], oldErrors: [] });
  expect(asked.sort()).toEqual([7001, 7002]);
  expect(db.query('SELECT run_id, outcome, apply_conclusion, failed_step FROM deploy_runs ORDER BY run_id').all()).toEqual([
    { run_id: 7001, outcome: 'no_apply', apply_conclusion: 'skipped', failed_step: null },
    { run_id: 7002, outcome: 'held', apply_conclusion: 'failure', failed_step: HOLD },
  ]);
  // Nothing is fetched twice.
  asked.length = 0;
  await syncDeploys(db, jobsGh(answers, asked));
  expect(asked).toEqual([]);
});

test('syncDeploys takes at most 60 a call, oldest first, and counts what is left', async () => {
  const answers: Record<number, unknown> = {};
  for (let i = 0; i < 65; i++) {
    const id = 8000 + i;
    storeRun(id, { created: new Date(Date.parse('2026-10-14T00:00:00Z') + (64 - i) * 60_000).toISOString().replace('.000', '') }); // a higher id is older
    answers[id] = jobsOf(job('apply', 'success'));
  }
  const first = await syncDeploys(db, jobsGh(answers));
  expect(first).toMatchObject({ fetched: 60, left: 5 });
  const stored = (db.query('SELECT run_id FROM deploy_runs').all() as { run_id: number }[]).map((x) => x.run_id);
  expect(stored).not.toContain(8000); // the newest five wait
  expect(stored).not.toContain(8004);
  expect(stored).toContain(8005);
  expect(stored).toContain(8064);
  const second = await syncDeploys(db, jobsGh(answers));
  expect(second).toMatchObject({ fetched: 5, left: 0 });
});

test('an unreadable jobs answer leaves no row and an error, and the next sync tries again', async () => {
  storeRun(9001);
  storeRun(9002);
  storeRun(9003);
  const answers = { 9001: jobsOf(job('apply', 'success')), 9002: { total_count: 'x' } }; // 9003: gh fails
  const r = await syncDeploys(db, jobsGh(answers));
  expect(r.fetched).toBe(1);
  expect(r.errors).toHaveLength(2);
  expect(r.errors.join('\n')).toContain('9002');
  expect(r.errors.join('\n')).toContain('9003');
  expect(db.query('SELECT run_id FROM deploy_runs').all()).toEqual([{ run_id: 9001 }]);
  const again = await syncDeploys(db, jobsGh({ ...answers, 9002: jobsOf(job('apply', 'skipped')), 9003: jobsOf(job('apply', 'success')) }));
  expect(again).toMatchObject({ fetched: 2, errors: [] });
});

test('syncGoals classifies the deploy-prod runs it stored, and reports the errors', async () => {
  const runs = { 'cloud/2026-10-14': [depRun(4), depRun(5, { conclusion: 'failure' })] };
  const base = gh(runs);
  const answers = { 4: jobsOf(job('apply', 'success')) }; // 5: unreadable
  const jobs = jobsGh(answers);
  const both: Runner = (cmd, o) => (cmd.some((c) => c.includes('/jobs?')) ? jobs(cmd, o) : base(cmd, o));
  const r = await syncGoals(db, both, { from: new Date('2026-10-12T00:00:00Z') });
  expect(r.deployRuns).toBe(1);
  expect(r.deployLeft).toBe(0);
  expect(r.errors.some((e) => e.includes('deploy-prod run 5'))).toBe(true);
  expect(db.query('SELECT run_id, outcome FROM deploy_runs').all()).toEqual([{ run_id: 4, outcome: 'applied_ok' }]);
  const wed = goalRows(db, 4).days[1]!;
  expect(wed.deploys).toMatchObject({ runs: 2, applied_ok: 1, unclassified: 1 });
});

test('a re-run with a new attempt is classified again; a stored row for an older attempt counts nowhere', async () => {
  storeRun(9501, { conclusion: 'failure' });
  const first = { 9501: jobsOf(job('apply', 'failure', [{ name: 'Apply', conclusion: 'failure' }])) };
  await syncDeploys(db, jobsGh(first));
  expect(db.query('SELECT outcome, attempt FROM deploy_runs').all()).toEqual([{ outcome: 'applied_failed', attempt: 1 }]);
  // The same day, the run is re-run: attempt 2 is running, then succeeds.
  db.query(`UPDATE ci_runs SET attempt = 2, status = 'in_progress', conclusion = NULL WHERE id = 9501`).run();
  const asked: number[] = [];
  expect(await syncDeploys(db, jobsGh({}, asked))).toMatchObject({ fetched: 0, errors: [] });
  expect(asked).toEqual([]); // not completed: not fetched
  expect(goalRows(db, 4).days.find((d) => d.deploys?.runs === 1)!.deploys).toMatchObject({ applied_failed: 0, unclassified: 0, running: 1 });
  db.query(`UPDATE ci_runs SET status = 'completed', conclusion = 'success' WHERE id = 9501`).run();
  expect(goalRows(db, 4).days.find((d) => d.deploys?.runs === 1)!.deploys).toMatchObject({ applied_failed: 0, unclassified: 1 });
  const r = await syncDeploys(db, jobsGh({ 9501: jobsOf(job('apply', 'success', [{ name: 'Apply', conclusion: 'success' }])) }));
  expect(r).toMatchObject({ fetched: 1, errors: [] });
  expect(db.query('SELECT outcome, attempt FROM deploy_runs').all()).toEqual([{ outcome: 'applied_ok', attempt: 2 }]);
});

test('syncDeploys asks for the attempt hq stored, so a later re-run cannot stand in for it', async () => {
  storeRun(9601);
  db.query('UPDATE ci_runs SET attempt = 2 WHERE id = 9601').run();
  const urls: string[] = [];
  const gh: Runner = async (cmd) => {
    urls.push(cmd.find((c) => c.startsWith('repos/'))!);
    return { code: 0, stdout: JSON.stringify(jobsOf(job('apply', 'success'))), stderr: '' };
  };
  await syncDeploys(db, gh);
  expect(urls).toEqual(['repos/zgeoff/cloud/actions/runs/9601/attempts/2/jobs?per_page=100']);
});

test('a run GitHub no longer has is stored as unknown; an older run that keeps failing does not hold the check-in', async () => {
  storeRun(9701, { created: '2026-10-01T00:00:00Z' }); // before the window
  storeRun(9702, { created: '2026-10-14T00:00:00Z' });
  storeRun(9703, { created: '2026-10-14T00:00:01Z' });
  const r = await syncDeploys(db, jobsGh({ 9702: 404, 9703: jobsOf(job('apply', 'success')) }), undefined, undefined, 60, new Date('2026-10-10T00:00:00Z'));
  expect(r.errors).toEqual([]);
  expect(r.oldErrors.length).toBe(1);
  expect(r.oldErrors[0]).toContain('9701');
  expect(db.query('SELECT run_id, outcome FROM deploy_runs ORDER BY run_id').all()).toEqual([
    { run_id: 9702, outcome: 'unknown' },
    { run_id: 9703, outcome: 'applied_ok' },
  ]);
});

test('old runs that keep failing cannot take every slot: runs inside the window go first', async () => {
  for (let i = 0; i < 61; i++) storeRun(9800 + i, { created: `2026-10-01T00:${String(i % 60).padStart(2, '0')}:00Z` }); // before the window; no answer: they fail
  storeRun(9900, { created: '2026-10-14T00:00:00Z' });
  const asked: number[] = [];
  const r = await syncDeploys(db, jobsGh({ 9900: jobsOf(job('apply', 'success')) }, asked), undefined, undefined, 60, new Date('2026-10-10T00:00:00Z'));
  expect(asked[0]).toBe(9900);
  expect(r).toMatchObject({ left: 0, errors: [] });
  expect(r.oldErrors.length).toBe(59);
  expect(db.query('SELECT outcome FROM deploy_runs WHERE run_id = 9900').get()).toEqual({ outcome: 'applied_ok' });
});
