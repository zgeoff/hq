import { z } from 'zod';
import { expect, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { updateEnv } from '@zgeoff/testing/helpers';
import invariant from 'tiny-invariant';
import { toErrorMessage } from '../src/to-error-message.ts';
import { issueOf } from '../src/kinds/issue-of.ts';
import { kindOf } from '../src/kinds/kind-of.ts';
import { kindText } from '../src/kinds/kind-text.ts';
import { kindWeeks } from '../src/kinds/kind-weeks.ts';
import { linearState } from '../src/kinds/linear-state.ts';
import { mondayOf } from '../src/kinds/monday-of.ts';
import { readFetchedDays } from '../src/kinds/read-fetched-days.ts';
import { syncDay } from '../src/kinds/sync-day.ts';
import { syncKinds } from '../src/kinds/sync-kinds.ts';
import { syncLinear } from '../src/kinds/sync-linear.ts';
import { makeLinearCaller } from '../src/linear/make-linear-caller.ts';
import { pickIssueType as typeOf } from '../src/linear/pick-issue-type.ts';
import { readLinearIssues } from '../src/linear/read-linear-issues.ts';
import { redact } from '../src/linear/redact.ts';
import { resetKey as forgetKey } from '../src/linear/reset-key.ts';
import { syncClosed } from '../src/linear/sync-closed.ts';
import { syncPRIssues } from '../src/linear/sync-pr-issues.ts';
import type { LinearCall } from '../src/linear/types.ts';
import type { Runner } from '../src/runner/types.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';
import { at, freshDb } from './helpers.ts';
import { LINEAR_GRAPHQL_URL } from '../mocks/linear-handlers.ts';
import { server } from '../mocks/node.ts';

const KEY = 'lin_api_INVENTEDdummyKEY0123456789';

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  updateEnv('HQ_NOW', '2026-10-16T02:00:00Z');

  return { db: base.db, seed: buildSeeder(base) };
}

test.each<[string, ReturnType<typeof kindOf>]>([
  ['fix(geo-12): an invented fix', 'fix'],
  ['feat!: an invented feature', 'feat'],
  ['Fix: capital prefix', 'fix'],
  ['chore(deps): bump an invented package', 'chore'],
  ['runs: an area prefix', 'other'],
  ['no prefix at all', 'other'],
  ['fixes: not a known kind', 'other'],
  ['fix an invented thing', 'other'],
])('it reads the kind of %p as %p', (title, kind) => expect(kindOf(title)).toBe(kind));

test.each<[string | null, string | null]>([
  ['Fixes GEO-12', 'GEO-12'],
  ['Related to GEO-3\nFixes: GEO-12', 'GEO-12'],
  ['Contributes to GEO-7, Related to GEO-3', 'GEO-7'],
  ['mentions GEO-9 only', null],
  ['Fixes geo-12', null],
  ['', null],
  [null, null],
])('it reads the issue of %p as %p', (body, issue) => expect(issueOf(body)).toBe(issue));

function ghFake(byDay: Record<string, { repo: string; n: number; title: string; at: string; body?: string }[]>, calls: string[] = []): Runner {
  return async (cmd) => {
    const range = cmd[cmd.indexOf('--merged-at') + 1]!;
    const day = range.slice(0, 10);
    calls.push(day);
    const rows = (byDay[day] ?? []).map((p) => ({ number: p.n, title: p.title, body: p.body ?? '', closedAt: p.at, repository: { name: p.repo } }));
    return { code: 0, stdout: JSON.stringify(rows), stderr: '' };
  };
}

test('a past day is recorded once; today is fetched each time', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const run = ghFake(
    {
      '2026-10-14': [{ repo: 'atc', n: 1, title: 'fix: an invented fix', at: '2026-10-14T05:00:00Z', body: 'Fixes GEO-1' }],
      '2026-10-16': [{ repo: 'atc', n: 2, title: 'feat: an invented feature', at: '2026-10-16T01:00:00Z' }],
    },
    calls,
  );
  const result = await syncKinds(ctx.db, run, { from: new Date('2026-10-14T00:00:00Z'), maxDays: 10 });
  expect(result).toMatchObject({ days: ['2026-10-14', '2026-10-15', '2026-10-16'], prs: 2, left: 0 });
  expect(readFetchedDays(ctx.db)).toStrictEqual(new Set(['2026-10-14', '2026-10-15']));
  expect(ctx.db.query('SELECT kind, issue FROM merged_prs WHERE number = 1').get()).toStrictEqual({ kind: 'fix', issue: 'GEO-1' });
  calls.length = 0;
  await syncKinds(ctx.db, run, { from: new Date('2026-10-14T00:00:00Z'), maxDays: 10 });
  expect(calls).toEqual(['2026-10-16']);
});

test('maxDays bounds a sync, and the rest is left for later', async () => {
  const ctx = setupTest();
  const result = await syncKinds(ctx.db, ghFake({}), { from: new Date('2026-10-01T00:00:00Z'), maxDays: 3 });
  expect(result).toMatchObject({ days: ['2026-10-01', '2026-10-02', '2026-10-03'], left: 13 });
});

test('a full day or a failed search records nothing', async () => {
  const ctx = setupTest();
  const full: Runner = async () => ({ code: 0, stdout: JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ number: i, title: 'x', closedAt: '2026-10-14T00:00:00Z', repository: { name: 'a' } }))), stderr: '' });
  await expect(syncDay(ctx.db, full, '2026-10-14')).rejects.toThrow('1000+ merged PRs');
  const bad: Runner = async () => ({ code: 1, stdout: '', stderr: 'invented failure' });
  await expect(syncDay(ctx.db, bad, '2026-10-14')).rejects.toThrow('invented failure');
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM merged_prs').get()).toStrictEqual({ count: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM merged_pr_days').get()).toStrictEqual({ count: 0 });
});

test('weeks start Monday 00:00 Sydney, across the DST change', () => {
  // DST began Sunday 2026-10-04: Monday 5 Oct starts 13:00Z, Monday 28 Sep starts 14:00Z.
  expect(mondayOf(new Date('2026-10-16T02:00:00Z')).toISOString()).toBe('2026-10-11T13:00:00.000Z');
  expect(mondayOf(new Date('2026-10-11T13:00:00Z')).toISOString()).toBe('2026-10-11T13:00:00.000Z');
  expect(mondayOf(new Date('2026-10-11T12:59:00Z')).toISOString()).toBe('2026-10-04T13:00:00.000Z');
  expect(mondayOf(new Date('2026-10-04T12:00:00Z')).toISOString()).toBe('2026-09-27T14:00:00.000Z');
});

const node = (id: string, type: string | null, closed: { completedAt?: string; canceledAt?: string } = {}) => ({
  identifier: id,
  title: `invented ${id}`,
  completedAt: closed.completedAt ?? null,
  canceledAt: closed.canceledAt ?? null,
  labels: { nodes: [{ name: 'cloud', parent: null }, { name: 'S', parent: { name: 'Size' } }, ...(type ? [{ name: type, parent: { name: 'Type' } }] : [])] },
});

test('the Type label decides the type; other labels and groups do not', () => {
  expect(typeOf(node('GEO-1', 'Bug'))).toBe('Bug');
  expect(typeOf(node('GEO-2', null))).toBe('none');
  expect(typeOf({ ...node('GEO-3', null), labels: { nodes: [{ name: 'Bug', parent: null }] } })).toBe('none');
  expect(typeOf({ ...node('GEO-4', null), labels: { nodes: [{ name: 'Urgent', parent: { name: 'Type' } }] } })).toBe('none');
});

test('closed issues page through Linear; PR issues are typed, and an unknown id is stored as none', async () => {
  const ctx = setupTest();
  const pages = [
    { nodes: [node('GEO-1', 'Bug', { completedAt: '2026-10-12T01:00:00Z' })], pageInfo: { hasNextPage: true, endCursor: 'c1' } },
    { nodes: [node('GEO-2', 'Feature', { canceledAt: '2026-10-13T01:00:00Z' })], pageInfo: { hasNextPage: false, endCursor: null } },
  ];
  const seen: unknown[] = [];
  const call: LinearCall = async (q, v) => {
    seen.push(v);
    if (q.includes('$ids')) return { issues: { nodes: [node('GEO-5', 'Improvement')] } };
    return { issues: pages.shift() };
  };
  const closed = await syncClosed(ctx.db, call, new Date('2026-10-11T13:00:00Z'));
  expect(closed).toBe(2);
  expect(z.object({ after: z.string() }).parse(seen[1]).after).toBe('c1');
  ctx.seed.mergedPR({ repo: 'atc', number: 1, merged_at: '2026-10-12T00:00:00Z', title: 'fix: x', kind: 'fix', issue: 'GEO-5' });
  ctx.seed.mergedPR({ repo: 'atc', number: 2, merged_at: '2026-10-12T00:00:00Z', title: 'fix: y', kind: 'fix', issue: 'GEO-404' });
  ctx.seed.mergedPR({ repo: 'atc', number: 3, merged_at: '2026-10-12T00:00:00Z', title: 'fix: z', kind: 'fix', issue: 'GEO-1' });
  const typed = await syncPRIssues(ctx.db, call);
  expect(typed).toBe(1);
  expect(ctx.db.query('SELECT issue, type, state FROM linear_issues ORDER BY issue').all()).toStrictEqual([
    { issue: 'GEO-1', type: 'Bug', state: 'completed' },
    { issue: 'GEO-2', type: 'Feature', state: 'canceled' },
    { issue: 'GEO-404', type: 'none', state: 'open' },
    { issue: 'GEO-5', type: 'Improvement', state: 'open' },
  ]);
});

test('it counts an issue Linear closed a millisecond into Monday in that week', async () => {
  const ctx = setupTest();
  await syncClosed(ctx.db, () => Promise.resolve({ issues: { nodes: [node('GEO-7', 'Bug', { completedAt: '2026-10-11T13:00:00.001Z' })], pageInfo: { hasNextPage: false, endCursor: null } } }), new Date('2026-10-11T13:00:00Z'));

  const [previous, current] = kindWeeks(ctx.db, 2);
  expect(current?.issues.Bug).toBe(1);
  expect(previous?.issues.Bug).toBe(0);
});

test('each issue counts in the Sydney week it closed; the three bug shares', async () => {
  const ctx = setupTest();
  ctx.seed.mergedPR({ repo: 'atc', number: 1, merged_at: '2026-10-12T01:00:00Z', title: 'fix: one', kind: 'fix', issue: 'GEO-1' });
  ctx.seed.mergedPR({ repo: 'atc', number: 2, merged_at: '2026-10-12T02:00:00Z', title: 'feat: two', kind: 'feat', issue: 'GEO-2' });
  ctx.seed.mergedPR({ repo: 'atc', number: 3, merged_at: '2026-10-12T03:00:00Z', title: 'runs: three', kind: 'other', issue: null });
  ctx.seed.mergedPR({ repo: 'atc', number: 4, merged_at: '2026-10-12T04:00:00Z', title: 'fix: four', kind: 'fix', issue: 'GEO-1' });
  ctx.seed.linearIssue({ issue: 'GEO-1', type: 'Bug', state: 'completed', closed_at: '2026-10-11T13:30:00Z' });
  ctx.seed.linearIssue({ issue: 'GEO-2', type: 'Feature', state: 'completed', closed_at: '2026-10-11T12:30:00Z' });
  ctx.seed.linearIssue({ issue: 'GEO-3', type: 'Chore', state: 'canceled', closed_at: '2026-10-12T00:00:00Z' });
  const [previous, current] = kindWeeks(ctx.db, 2);
  invariant(previous);
  invariant(current);
  expect(current).toMatchObject({ from: '2026-10-11T13:00:00Z', partial: true, total: 4, bugShare: 50, prUnlinked: 1, prBugShare: 66.7, canceled: 1, issueBugShare: 100 });
  expect(current.issues).toMatchObject({ Bug: 1, Feature: 0 });
  expect(current.prTypes).toMatchObject({ Bug: 2, Feature: 1 });
  expect(previous).toMatchObject({ partial: false, total: 0, bugShare: null, issueBugShare: 0 });
  expect(previous.issues.Feature).toBe(1);
  expect(kindText([previous, current], { syncedAt: null, error: null }).join('\n')).toContain('Linear issue types: not read yet');
  const text = kindText([previous, current], { syncedAt: '2026-10-16T01:00:00Z', error: null }).join('\n');
  expect(text).toContain('12 Oct so far');
  expect(text).toContain('Linear issues completed');
});

test('a Linear failure is kept for the text and thrown', async () => {
  const ctx = setupTest();
  const call: LinearCall = async () => {
    throw new Error('invented outage');
  };
  await expect(syncLinear(ctx.db, call, new Date('2026-10-14T00:00:00Z'), { run: buildStubGitHubFactsRunner({}) })).rejects.toThrow('invented outage');
  expect(linearState(ctx.db)).toStrictEqual({ syncedAt: null, error: 'invented outage' });
});

test('a gh row hq cannot read records nothing', async () => {
  const ctx = setupTest();
  const ok = { number: 1, title: 't', closedAt: '2026-10-14T05:00:00Z', repository: { name: 'a' } };
  for (const row of [
    { ...ok, number: 'x' },
    { ...ok, number: 0 },
    { ...ok, number: -1 },
    { ...ok, closedAt: 'soon' },
    { ...ok, closedAt: '0' },
    { ...ok, closedAt: '2026-10-13T23:00:00Z' },
    { ...ok, repository: { name: '../a' } },
    { ...ok, repository: { name: '..' } },
    { ...ok, repository: { name: '' } },
  ]) {
    const run: Runner = async () => ({ code: 0, stdout: JSON.stringify([row]), stderr: '' });
    await expect(syncDay(ctx.db, run, '2026-10-14')).rejects.toThrow("can't read");
  }
  const notList: Runner = async () => ({ code: 0, stdout: '{}', stderr: '' });
  await expect(syncDay(ctx.db, notList, '2026-10-14')).rejects.toThrow('did not return a list');
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM merged_prs').get()).toStrictEqual({ count: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM merged_pr_days').get()).toStrictEqual({ count: 0 });
});

test('Linear ids hq did not ask for are not stored; an inherited type name counts as none', async () => {
  const ctx = setupTest();
  ctx.seed.mergedPR({ repo: 'atc', number: 1, merged_at: '2026-10-12T00:00:00Z', title: 'fix: x', kind: 'fix', issue: 'GEO-5' });
  const call: LinearCall = async () => ({ issues: { nodes: [node('GEO-5', 'Bug'), node('GEO-999', 'Bug')] } });
  await syncPRIssues(ctx.db, call);
  expect(readLinearIssues(ctx.db).map((issue) => issue.issue)).toStrictEqual(['GEO-5']);
  ctx.seed.linearIssueOfUnknownType({ issue: 'GEO-5', type: 'constructor' });
  const [week] = kindWeeks(ctx.db, 1);
  expect(week?.prTypes.none).toBe(1);
});

test.each<[string, () => ReturnType<typeof http.post>]>([
  ['Linear echoes it in a 400 reply', () => http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: `bad key ${KEY} sent` }, { message: 'also lin_api_OTHERinventedKEY' }] }, { status: 400 }))],
  ['the connection drops', () => http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.error())],
])('the key never reaches an error or hq.db when %s', async (_case, buildHandler) => {
  const ctx = setupTest();
  forgetKey();
  onTestFinished(forgetKey);
  updateEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token');
  server.use(buildHandler());
  const run: Runner = async () => ({ code: 0, stdout: `${KEY}\n`, stderr: '' });

  const err = await syncLinear(ctx.db, makeLinearCaller(run), new Date('2026-10-14T00:00:00Z'), { run }).catch((error: unknown) => error);

  expect(toErrorMessage(err)).not.toContain('lin_api_');
  expect(linearState(ctx.db).error).not.toContain('lin_api_');
  expect(JSON.stringify(ctx.db.query('SELECT * FROM meta').all())).not.toContain(KEY);
});

test('redact replaces the key with a placeholder', () => {
  expect(redact(`a ${KEY} b`, KEY)).toBe('a [key] b');
});

test('the key is cut from an op failure', async () => {
  forgetKey();
  onTestFinished(forgetKey);
  updateEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token');
  const caller = makeLinearCaller(() => Promise.resolve({ code: 1, stdout: KEY, stderr: `[ERROR] ${KEY} could not be read` }));

  const err = await caller('q', {}).catch((error: unknown) => error);

  expect(toErrorMessage(err)).not.toContain(KEY);
});

test('a traced fetch is refused before any request is sent', async () => {
  forgetKey();
  onTestFinished(forgetKey);
  updateEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token');
  updateEnv('BUN_CONFIG_VERBOSE_FETCH', 'curl');
  const requests: string[] = [];
  server.use(
    http.post(LINEAR_GRAPHQL_URL, ({ request }) => {
      requests.push(request.url);
      return HttpResponse.json({ data: {} });
    }),
  );
  const ok: Runner = async () => ({ code: 0, stdout: KEY, stderr: '' });

  await expect(makeLinearCaller(ok)('q', {})).rejects.toThrow('BUN_CONFIG_VERBOSE_FETCH');
  expect(requests).toStrictEqual([]);
});

test('a stored title has the key cut from it', async () => {
  const ctx = setupTest();
  const call: LinearCall = async () => ({ issues: { nodes: [{ ...node('GEO-1', 'Bug', { completedAt: '2026-10-14T01:00:00Z' }), title: `pasted ${KEY}` }], pageInfo: { hasNextPage: false, endCursor: null } } });

  await syncClosed(ctx.db, call, new Date('2026-10-14T00:00:00Z'));

  expect(JSON.stringify(ctx.db.query('SELECT * FROM linear_issues').all())).not.toContain(KEY);
});

test('a multi-day sync spaces its searches', async () => {
  const ctx = setupTest();
  process.env['HQ_SEARCH_GAP_MS'] = '40';
  try {
    const t0 = Date.now();
    await syncKinds(ctx.db, ghFake({}), { from: new Date('2026-10-13T00:00:00Z'), maxDays: 3 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(75);
  } finally {
    process.env['HQ_SEARCH_GAP_MS'] = '0';
  }
});

test('merged PRs in a repo not in scope are not stored', async () => {
  const ctx = setupTest();
  const run = ghFake({ '2026-10-14': [{ repo: 'atc', n: 1, title: 'fix: an invented fix', at: '2026-10-14T05:00:00Z' }, { repo: 'decree', n: 2, title: 'feat: invented', at: '2026-10-14T06:00:00Z' }] });
  const stored = await syncDay(ctx.db, run, '2026-10-14');
  expect(stored).toBe(1);
  expect(ctx.db.query('SELECT repo FROM merged_prs').all()).toStrictEqual([{ repo: 'atc' }]);
});

test('kindWeeks counts no stored merge of a repo now out of scope', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  ctx.seed.mergedPR({ repo: 'atc', number: 1, merged_at: '2026-10-14T02:00:00Z', title: 'fix: x', kind: 'fix' });
  ctx.seed.mergedPR({ repo: 'teapots', number: 2, merged_at: '2026-10-14T03:00:00Z', title: 'fix: y', kind: 'fix' });
  const [week] = kindWeeks(ctx.db, 1);
  expect(week?.kinds.fix).toBe(1);
  expect(week?.total).toBe(1);
});

test('#kindWeeks keeps a stored kind it does not know under its own name, and counts it in the total', async () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  await syncDay(ctx.db, ghFake({ '2026-10-14': [{ repo: 'atc', 'n': 1, title: 'fix: an invented fix', at: '2026-10-14T02:00:00Z' }] }), '2026-10-14');
  ctx.seed.mergedPR({ repo: 'atc', number: 2, merged_at: '2026-10-14T03:00:00Z', title: 'wip: y', kind: 'wip' });

  const [week] = kindWeeks(ctx.db, 1);
  expect(week?.total).toBe(2);
  expect<unknown>(week?.kinds).toStrictEqual({ fix: 1, feat: 0, chore: 0, docs: 0, test: 0, refactor: 0, ci: 0, build: 0, perf: 0, revert: 0, style: 0, other: 0, wip: 1 });
});
