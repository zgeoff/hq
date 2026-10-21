import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { issueOf } from '../src/kinds/issue-of.ts';
import { kindOf } from '../src/kinds/kind-of.ts';
import { kindText } from '../src/kinds/kind-text.ts';
import { kindWeeks } from '../src/kinds/kind-weeks.ts';
import { linearState } from '../src/kinds/linear-state.ts';
import { mondayOf } from '../src/kinds/monday-of.ts';
import { syncDay } from '../src/kinds/sync-day.ts';
import { syncKinds } from '../src/kinds/sync-kinds.ts';
import { syncLinear } from '../src/kinds/sync-linear.ts';
import { makeLinearCaller } from '../src/linear/make-linear-caller.ts';
import { pickIssueType as typeOf } from '../src/linear/pick-issue-type.ts';
import { redact } from '../src/linear/redact.ts';
import { resetKey as forgetKey } from '../src/linear/reset-key.ts';
import { syncClosed } from '../src/linear/sync-closed.ts';
import { syncPrIssues } from '../src/linear/sync-pr-issues.ts';
import type { LinearCall } from '../src/linear/types.ts';
import type { Runner } from '../src/runner/types.ts';
import { at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());

  // Friday 13:00 Sydney (AEDT)
  process.env['HQ_NOW'] = '2026-10-16T02:00:00Z';
});
afterEach(() => {
  delete process.env['HQ_NOW'];
  cleanup();
});

test.each([
  ['fix(geo-12): an invented fix', 'fix'],
  ['feat!: an invented feature', 'feat'],
  ['Fix: capital prefix', 'fix'],
  ['chore(deps): bump an invented package', 'chore'],
  ['runs: an area prefix', 'other'],
  ['no prefix at all', 'other'],
  ['fixes: not a known kind', 'other'],
  ['fix an invented thing', 'other'],
] as [string, string][])('kind of %p is %p', (title, kind) => expect(kindOf(title)).toBe(kind as ReturnType<typeof kindOf>));

test.each([
  ['Fixes GEO-12', 'GEO-12'],
  ['Related to GEO-3\nFixes: GEO-12', 'GEO-12'],
  ['Contributes to GEO-7, Related to GEO-3', 'GEO-7'],
  ['mentions GEO-9 only', null],
  ['Fixes geo-12', null],
  ['', null],
  [null, null],
] as [string | null, string | null][])('issue of %p is %p', (body, issue) => expect(issueOf(body)).toBe(issue));

// A gh search that returns the given PRs for a day, keyed by day.
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
  const calls: string[] = [];
  const run = ghFake(
    {
      '2026-10-14': [{ repo: 'atc', n: 1, title: 'fix: an invented fix', at: '2026-10-14T05:00:00Z', body: 'Fixes GEO-1' }],
      '2026-10-16': [{ repo: 'atc', n: 2, title: 'feat: an invented feature', at: '2026-10-16T01:00:00Z' }],
    },
    calls,
  );
  const r = await syncKinds(db, run, { from: new Date('2026-10-14T00:00:00Z'), maxDays: 10 });
  expect(r).toMatchObject({ days: ['2026-10-14', '2026-10-15', '2026-10-16'], prs: 2, left: 0 });
  expect((db.query('SELECT day FROM merged_pr_days ORDER BY day').all() as { day: string }[]).map((x) => x.day)).toEqual(['2026-10-14', '2026-10-15']);
  expect(db.query('SELECT kind, issue FROM merged_prs WHERE number = 1').get()).toEqual({ kind: 'fix', issue: 'GEO-1' });
  calls.length = 0;
  await syncKinds(db, run, { from: new Date('2026-10-14T00:00:00Z'), maxDays: 10 });
  expect(calls).toEqual(['2026-10-16']);
});

test('maxDays bounds a sync, and the rest is left for later', async () => {
  const r = await syncKinds(db, ghFake({}), { from: new Date('2026-10-01T00:00:00Z'), maxDays: 3 });
  expect(r).toMatchObject({ days: ['2026-10-01', '2026-10-02', '2026-10-03'], left: 13 });
});

test('a full day or a failed search records nothing', async () => {
  const full: Runner = async () => ({ code: 0, stdout: JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ number: i, title: 'x', closedAt: '2026-10-14T00:00:00Z', repository: { name: 'a' } }))), stderr: '' });
  await expect(syncDay(db, full, '2026-10-14')).rejects.toThrow('1000+ merged PRs');
  const bad: Runner = async () => ({ code: 1, stdout: '', stderr: 'invented failure' });
  await expect(syncDay(db, bad, '2026-10-14')).rejects.toThrow('invented failure');
  expect(db.query('SELECT COUNT(*) AS n FROM merged_prs').get()).toEqual({ n: 0 });
  expect(db.query('SELECT COUNT(*) AS n FROM merged_pr_days').get()).toEqual({ n: 0 });
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
  expect(await syncClosed(db, call, new Date('2026-10-11T13:00:00Z'))).toBe(2);
  expect((seen[1] as { after: string }).after).toBe('c1');
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-12T00:00:00Z', 'fix: x', 'fix', 'GEO-5'), ('atc', 2, '2026-10-12T00:00:00Z', 'fix: y', 'fix', 'GEO-404'), ('atc', 3, '2026-10-12T00:00:00Z', 'fix: z', 'fix', 'GEO-1')`).run();
  expect(await syncPrIssues(db, call)).toBe(1);
  expect(db.query('SELECT issue, type, state FROM linear_issues ORDER BY issue').all()).toEqual([
    { issue: 'GEO-1', type: 'Bug', state: 'completed' },
    { issue: 'GEO-2', type: 'Feature', state: 'canceled' },
    { issue: 'GEO-404', type: 'none', state: 'open' },
    { issue: 'GEO-5', type: 'Improvement', state: 'open' },
  ]);
});

test('each issue counts in the Sydney week it closed; the three bug shares', async () => {
  const ins = db.query('INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('atc', 1, '2026-10-12T01:00:00Z', 'fix: one', 'fix', 'GEO-1');
  ins.run('atc', 2, '2026-10-12T02:00:00Z', 'feat: two', 'feat', 'GEO-2');
  ins.run('atc', 3, '2026-10-12T03:00:00Z', 'runs: three', 'other', null);
  ins.run('atc', 4, '2026-10-12T04:00:00Z', 'fix: four', 'fix', 'GEO-1');
  const li = db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, 't', ?, ?, '2026-10-16T00:00:00Z')`);
  li.run('GEO-1', 'Bug', 'completed', '2026-10-11T13:30:00Z'); // Monday 00:30 Sydney: this week, not last
  li.run('GEO-2', 'Feature', 'completed', '2026-10-11T12:30:00Z'); // Sunday 23:30 Sydney: last week
  li.run('GEO-3', 'Chore', 'canceled', '2026-10-12T00:00:00Z');
  const [prev, cur] = kindWeeks(db, 2);
  expect(cur).toMatchObject({ from: '2026-10-11T13:00:00Z', partial: true, total: 4, bugShare: 50, prUnlinked: 1, prBugShare: 66.7, canceled: 1, issueBugShare: 100 });
  expect(cur!.issues).toMatchObject({ Bug: 1, Feature: 0 });
  expect(cur!.prTypes).toMatchObject({ Bug: 2, Feature: 1 });
  expect(prev).toMatchObject({ partial: false, total: 0, bugShare: null, issueBugShare: 0 });
  expect(prev!.issues.Feature).toBe(1);
  expect(kindText([prev!, cur!], { syncedAt: null, error: null }).join('\n')).toContain('Linear issue types: not read yet');
  const text = kindText([prev!, cur!], { syncedAt: '2026-10-16T01:00:00Z', error: null }).join('\n');
  expect(text).toContain('12 Oct so far');
  expect(text).toContain('Linear issues completed');
});

test('a Linear failure is kept for the text and thrown', async () => {
  const call: LinearCall = async () => {
    throw new Error('invented outage');
  };
  await expect(syncLinear(db, call, new Date('2026-10-14T00:00:00Z'))).rejects.toThrow('invented outage');
  expect(linearState(db)).toEqual({ syncedAt: null, error: 'invented outage' });
});

test('a gh row hq cannot read records nothing', async () => {
  const ok = { number: 1, title: 't', closedAt: '2026-10-14T05:00:00Z', repository: { name: 'a' } };
  for (const row of [
    { ...ok, number: 'x' },
    { ...ok, number: 0 },
    { ...ok, number: -1 },
    { ...ok, closedAt: 'soon' },
    { ...ok, closedAt: '0' },
    { ...ok, closedAt: '2026-10-13T23:00:00Z' }, // another day
    { ...ok, repository: { name: '../a' } },
    { ...ok, repository: { name: '..' } },
    { ...ok, repository: { name: '' } },
  ]) {
    const run: Runner = async () => ({ code: 0, stdout: JSON.stringify([row]), stderr: '' });
    await expect(syncDay(db, run, '2026-10-14')).rejects.toThrow("can't read");
  }
  const notList: Runner = async () => ({ code: 0, stdout: '{}', stderr: '' });
  await expect(syncDay(db, notList, '2026-10-14')).rejects.toThrow('did not return a list');
  expect(db.query('SELECT COUNT(*) AS n FROM merged_prs').get()).toEqual({ n: 0 });
  expect(db.query('SELECT COUNT(*) AS n FROM merged_pr_days').get()).toEqual({ n: 0 });
});

test('Linear ids hq did not ask for are not stored; an inherited type name counts as none', async () => {
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-12T00:00:00Z', 'fix: x', 'fix', 'GEO-5')`).run();
  const call: LinearCall = async () => ({ issues: { nodes: [node('GEO-5', 'Bug'), node('GEO-999', 'Bug')] } });
  await syncPrIssues(db, call);
  expect((db.query('SELECT issue FROM linear_issues ORDER BY issue').all() as { issue: string }[]).map((r) => r.issue)).toEqual(['GEO-5']);
  db.query(`UPDATE linear_issues SET type = 'constructor'`).run();
  const [w] = kindWeeks(db, 1);
  expect(w!.prTypes.none).toBe(1);
});

test('the key never reaches an error or hq.db, even when Linear echoes it', async () => {
  const KEY = 'lin_api_INVENTEDdummyKEY0123456789';
  forgetKey();
  process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'invented-token';
  const run: Runner = async () => ({ code: 0, stdout: `${KEY}\n`, stderr: '' });
  const echo = (async () => new Response(JSON.stringify({ errors: [{ message: `bad key ${KEY} sent` }, { message: 'also lin_api_OTHERinventedKEY' }] }), { status: 400 })) as unknown as typeof fetch;
  const down = (async () => {
    throw new Error(`socket closed after ${KEY}`);
  }) as unknown as typeof fetch;
  try {
    for (const f of [echo, down]) {
      const err = await syncLinear(db, makeLinearCaller(run, f), new Date('2026-10-14T00:00:00Z')).catch((error: unknown) => error);
      expect(String((err as Error).message)).not.toContain('lin_api_');
      expect(linearState(db).error).not.toContain('lin_api_');
      expect(JSON.stringify(db.query('SELECT * FROM meta').all())).not.toContain(KEY);
    }
  } finally {
    delete process.env['OP_SERVICE_ACCOUNT_TOKEN'];
    forgetKey();
  }
  expect(redact(`a ${KEY} b`, KEY)).toBe('a [key] b');
});

test('the key is cut from an op failure and a stored title, and a traced fetch is refused', async () => {
  const KEY = 'lin_api_INVENTEDdummyKEY0123456789';
  forgetKey();
  process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'invented-token';
  try {
    const caller = makeLinearCaller(() => Promise.resolve({ code: 1, stdout: KEY, stderr: `[ERROR] ${KEY} could not be read` })),
      err = await caller('q', {}).catch((error: unknown) => error);
    expect(String((err as Error).message)).not.toContain(KEY);
    process.env['BUN_CONFIG_VERBOSE_FETCH'] = 'curl';
    const ok: Runner = async () => ({ code: 0, stdout: KEY, stderr: '' });
    let fetched = false;
    const f = (async () => {
      fetched = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(makeLinearCaller(ok, f)('q', {})).rejects.toThrow('BUN_CONFIG_VERBOSE_FETCH');
    expect(fetched).toBe(false);
  } finally {
    delete process.env['BUN_CONFIG_VERBOSE_FETCH'];
    delete process.env['OP_SERVICE_ACCOUNT_TOKEN'];
    forgetKey();
  }
  const call: LinearCall = async () => ({ issues: { nodes: [{ ...node('GEO-1', 'Bug', { completedAt: '2026-10-14T01:00:00Z' }), title: `pasted ${KEY}` }], pageInfo: { hasNextPage: false, endCursor: null } } });
  await syncClosed(db, call, new Date('2026-10-14T00:00:00Z'));
  expect(JSON.stringify(db.query('SELECT * FROM linear_issues').all())).not.toContain(KEY);
});

test('a multi-day sync spaces its searches', async () => {
  process.env['HQ_SEARCH_GAP_MS'] = '40';
  try {
    const t0 = Date.now();
    await syncKinds(db, ghFake({}), { from: new Date('2026-10-13T00:00:00Z'), maxDays: 3 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(75);
  } finally {
    process.env['HQ_SEARCH_GAP_MS'] = '0';
  }
});

test('merged PRs in a repo not in scope are not stored', async () => {
  const run = ghFake({ '2026-10-14': [{ repo: 'atc', n: 1, title: 'fix: an invented fix', at: '2026-10-14T05:00:00Z' }, { repo: 'decree', n: 2, title: 'feat: invented', at: '2026-10-14T06:00:00Z' }] });
  expect(await syncDay(db, run, '2026-10-14')).toBe(1);
  expect(db.query('SELECT repo FROM merged_prs').all()).toEqual([{ repo: 'atc' }]);
});

test('kindWeeks counts no stored merge of a repo now out of scope', () => {
  at('2026-10-16T01:00:00Z');
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-14T02:00:00Z', 'fix: x', 'fix', NULL), ('teapots', 2, '2026-10-14T03:00:00Z', 'fix: y', 'fix', NULL)`).run();
  const [w] = kindWeeks(db, 1);
  expect(w!.kinds.fix).toBe(1);
  expect(w!.total).toBe(1);
});
