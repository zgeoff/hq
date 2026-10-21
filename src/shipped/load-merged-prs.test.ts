import { expect, onTestFinished, test } from 'bun:test';
import { buildMergedDayOutput, buildMergedPR } from '../../test/build-merged-day-output.ts';
import { buildStubDeliveryRunner } from '../../test/build-stub-delivery-runner.ts';
import { freshDb } from '../../test/helpers.ts';
import type { Runner } from '../runner/types.ts';
import { loadMergedPRs } from './load-merged-prs.ts';
import { mergedPRsOutputSchema } from './merged-prs-output-schema.ts';

const THURSDAY = new Date('2026-10-15T02:00:00Z');

function setupTest() {
  const buildSources = (run: Runner) => ({ db: fresh.db, run, call: () => Promise.resolve({}), scripts: '/kettle/scripts' }),
    fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, buildSources };
}

test('a week is read a day at a time and merged into what merged-prs.sh weekly prints', async () => {
  const ctx = setupTest(),
    pr41 = buildMergedPR({ number: 41, mergedAt: '2026-10-12T01:00:00Z', day: '2026-10-12', added: 10, removed: 2 }),
    pr42 = buildMergedPR({ number: 42, url: 'https://github.com/zgeoff/kettle/pull/42', mergedAt: '2026-10-14T03:00:00Z', day: '2026-10-14', added: 1, removed: 0 }),
    pr43 = buildMergedPR({ number: 43, url: 'https://github.com/zgeoff/kettle/pull/43', mergedAt: '2026-10-14T04:00:00Z', day: '2026-10-14', issue: 'GEO-9802', added: 3, removed: 1 }),
    pr44 = buildMergedPR({ number: 44, url: 'https://github.com/zgeoff/kettle/pull/44', mergedAt: '2026-10-15T01:00:00Z', day: '2026-10-15', issue: 'GEO-9802', added: 7, removed: 7 }),
    pr7 = buildMergedPR({ repo: 'lantern', number: 7, url: 'https://github.com/zgeoff/lantern/pull/7', mergedAt: '2026-10-12T02:00:00Z', day: '2026-10-12', issue: null, added: 5, removed: 5 }),
    stub = buildStubDeliveryRunner({
      days: {
        '2026-10-12': buildMergedDayOutput('2026-10-12', [pr41, pr7]),
        '2026-10-13': buildMergedDayOutput('2026-10-13', []),
        '2026-10-14': buildMergedDayOutput('2026-10-14', [pr42, pr43]),
        '2026-10-15': buildMergedDayOutput('2026-10-15', [pr44]),
      },
    }),
    text = await loadMergedPRs(ctx.buildSources(stub.run), 'week', THURSDAY);

  expect(JSON.parse(text)).toStrictEqual({
    kind: 'weekly',
    start: '2026-10-12T00:00:00+11:00',
    end: '2026-10-18T23:59:59+11:00',
    searchCount: 5,
    fetched: 5,
    totals: { prs: 5, issues: 2, repos: 2, added: 26, removed: 15 },
    byRepo: [
      { repo: 'kettle', prs: 4, added: 21, removed: 10 },
      { repo: 'lantern', prs: 1, added: 5, removed: 5 },
    ],
    byIssue: [
      {
        issue: 'GEO-9801',
        repos: ['kettle'],
        added: 11,
        removed: 2,
        prs: [
          { repo: 'kettle', number: 41, url: 'https://github.com/zgeoff/kettle/pull/41' },
          { repo: 'kettle', number: 42, url: 'https://github.com/zgeoff/kettle/pull/42' },
        ],
      },
      {
        issue: 'GEO-9802',
        repos: ['kettle'],
        added: 10,
        removed: 8,
        prs: [
          { repo: 'kettle', number: 43, url: 'https://github.com/zgeoff/kettle/pull/43' },
          { repo: 'kettle', number: 44, url: 'https://github.com/zgeoff/kettle/pull/44' },
        ],
      },
    ],
    noIssue: [{ repo: 'lantern', number: 7, title: 'Fit the long spout for GEO-9801', url: 'https://github.com/zgeoff/lantern/pull/7' }],
    prs: [pr41, pr42, pr43, pr44, pr7],
    workflow: [],
  });
  expect(stub.merged).toStrictEqual([
    ['daily', '2026-10-12'],
    ['daily', '2026-10-13'],
    ['daily', '2026-10-14'],
    ['daily', '2026-10-15'],
  ]);
});

test('a week with more than 1,000 merged PRs gives every one, because no search spans the week', async () => {
  const capped = Array.from({ length: 1000 }, (_unused, n) => buildMergedPR({ number: n, issue: null })),
    ctx = setupTest(),
    dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'],
    perDay = dates.map((date, index) => Array.from({ length: 350 }, (_unused, n) => buildMergedPR({ number: index * 1000 + n, day: date, mergedAt: `${date}T01:00:00Z`, issue: null }))),
    stub = buildStubDeliveryRunner({
      days: Object.fromEntries(dates.map((date, index) => [date, buildMergedDayOutput(date, perDay[index] ?? [])])),
      weekly: buildMergedDayOutput('2026-10-12', capped, 1400),
    }),
    text = await loadMergedPRs(ctx.buildSources(stub.run), 'week', THURSDAY),
    week = mergedPRsOutputSchema.parse(JSON.parse(text));

  expect([week.totals.prs, week.prs.length, week.searchCount, week.fetched]).toStrictEqual([1400, 1400, 1400, 1400]);
});

test('a day before today is read once and kept, so a second load asks only for today', async () => {
  const ctx = setupTest(),
    days = {
      '2026-10-12': buildMergedDayOutput('2026-10-12', []),
      '2026-10-13': buildMergedDayOutput('2026-10-13', []),
      '2026-10-14': buildMergedDayOutput('2026-10-14', []),
      '2026-10-15': buildMergedDayOutput('2026-10-15', []),
    },
    first = buildStubDeliveryRunner({ days }),
    second = buildStubDeliveryRunner({ days });

  await loadMergedPRs(ctx.buildSources(first.run), 'week', THURSDAY);
  await loadMergedPRs(ctx.buildSources(second.run), 'week', new Date('2026-10-15T03:00:00Z'));

  expect(second.merged).toStrictEqual([['daily', '2026-10-15']]);
});

test('today is read on every load and never kept', async () => {
  const ctx = setupTest(),
    stub = buildStubDeliveryRunner({ days: { '2026-10-15': buildMergedDayOutput('2026-10-15', []) } });

  await loadMergedPRs(ctx.buildSources(stub.run), 'today', THURSDAY);
  await loadMergedPRs(ctx.buildSources(stub.run), 'today', new Date('2026-10-15T02:00:01Z'));

  expect(stub.merged).toStrictEqual([
    ['daily', '2026-10-15'],
    ['daily', '2026-10-15'],
  ]);
  expect(ctx.db.query("SELECT key FROM shipped_cache WHERE kind = 'merged-day'").all()).toStrictEqual([]);
});

test('yesterday gives the day\'s output as merged-prs.sh printed it, and keeps it for good', async () => {
  const body = buildMergedDayOutput('2026-10-14', [buildMergedPR({ day: '2026-10-14' })]),
    ctx = setupTest(),
    fake = buildStubDeliveryRunner({ days: { '2026-10-14': body } }),
    first = await loadMergedPRs(ctx.buildSources(fake.run), 'yesterday', THURSDAY),
    later = await loadMergedPRs(ctx.buildSources(fake.run), 'yesterday', new Date('2026-10-15T05:00:00Z'));

  expect([first, later, fake.merged]).toStrictEqual([body, body, [['daily', '2026-10-14']]]);
});

test('a week whose Wednesday fails keeps Monday and Tuesday, which the next try does not ask for again', async () => {
  const broken = buildStubDeliveryRunner({ days: { '2026-10-12': buildMergedDayOutput('2026-10-12', []), '2026-10-13': buildMergedDayOutput('2026-10-13', []) } }),
    ctx = setupTest(),
    failure = await loadMergedPRs(ctx.buildSources(broken.run), 'week', THURSDAY).then(
      () => null,
      (error: unknown) => (error as Error).message,
    ),
    mended = buildStubDeliveryRunner({ days: { '2026-10-14': buildMergedDayOutput('2026-10-14', []), '2026-10-15': buildMergedDayOutput('2026-10-15', []) } });

  await loadMergedPRs(ctx.buildSources(mended.run), 'week', THURSDAY);

  expect(failure).toBe('merged-prs.sh exited 1: gh: offline');
  expect(mended.merged).toStrictEqual([
    ['daily', '2026-10-14'],
    ['daily', '2026-10-15'],
  ]);
});

test('a day in another shape is refused, naming the fields, and is not kept', async () => {
  const ctx = setupTest(),
    stub = buildStubDeliveryRunner({ days: { '2026-10-14': JSON.stringify({ totals: {}, byIssue: [{ issue: 9401 }] }) } });

  await expect(loadMergedPRs(ctx.buildSources(stub.run), 'yesterday', THURSDAY)).rejects.toThrow(/^merged-prs\.sh printed an unexpected shape: .*byIssue\.0\.issue/u);
  expect(ctx.db.query('SELECT key FROM shipped_cache').all()).toStrictEqual([]);
});

test('a day without its noIssue list is refused, naming the field, and is not kept', async () => {
  const ctx = setupTest(),
    stub = buildStubDeliveryRunner({
      days: {
        '2026-10-14': JSON.stringify({
          kind: 'daily',
          start: '2026-10-14T00:00:00+11:00',
          end: '2026-10-14T23:59:59+11:00',
          searchCount: 0,
          fetched: 0,
          totals: { prs: 0, issues: 0, repos: 0, added: 0, removed: 0 },
          byRepo: [],
          byIssue: [],
          prs: [],
          workflow: [],
        }),
      },
    });

  await expect(loadMergedPRs(ctx.buildSources(stub.run), 'yesterday', THURSDAY)).rejects.toThrow('merged-prs.sh printed an unexpected shape: noIssue');
  expect(ctx.db.query('SELECT key FROM shipped_cache').all()).toStrictEqual([]);
});

test('a kept day in another shape is read again, and the fresh output replaces it', async () => {
  const ctx = setupTest(),
    fresh = buildMergedDayOutput('2026-10-14', [buildMergedPR({ day: '2026-10-14' })]),
    stub = buildStubDeliveryRunner({ days: { '2026-10-14': fresh } });
  ctx.db
    .query("INSERT INTO shipped_cache (kind, key, body, fetched_at, expires_at) VALUES ('merged-day', '2026-10-14', ?, '2026-10-14T20:00:00Z', NULL)")
    .run(
      JSON.stringify({
        kind: 'daily',
        start: '2026-10-14T00:00:00+11:00',
        end: '2026-10-14T23:59:59+11:00',
        searchCount: 1,
        fetched: 1,
        totals: { prs: 1, issues: 1, repos: 1, added: 10, removed: 2 },
        byRepo: [{ repo: 'kettle', prs: 1, added: 10, removed: 2 }],
        byIssue: [],
        noIssue: [],
        prs: [{ repo: 'kettle', number: 41, title: 'Fit the long spout', url: 'https://github.com/zgeoff/kettle/pull/41', mergedAt: '2026-10-14T01:00:00Z', day: '2026-10-14', issue: 9801, added: 10, removed: 2, excludedFiles: [], approximate: false }],
        workflow: [],
      }),
    );

  await expect(loadMergedPRs(ctx.buildSources(stub.run), 'yesterday', THURSDAY)).resolves.toBe(fresh);
  expect(stub.merged).toStrictEqual([['daily', '2026-10-14']]);
  expect(ctx.db.query("SELECT body FROM shipped_cache WHERE kind = 'merged-day'").all()).toStrictEqual([{ body: fresh }]);
});
