import { expect, onTestFinished, test } from 'bun:test';
import { makeLinearFake } from '../../test/make-linear-fake.ts';
import { freshDb } from '../../test/helpers.ts';
import { loadReportIssues } from './load-report-issues.ts';
import type { ReportIssue } from './types.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

function buildIssue(over: Partial<ReportIssue>): ReportIssue {
  return { id: 'GEO-9801', title: 'Fit the long spout', url: 'https://linear.example/issue/GEO-9801', status: 'In Review', statusType: 'started', project: 'Kettle', priority: 2, labels: ['Bug'], ...over };
}

const T0 = new Date('2026-10-15T02:00:00Z');

test('an open issue is kept for under 5 minutes', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = makeLinearFake([buildIssue({})], [], asked),
    first = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], T0),
    second = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], new Date('2026-10-15T02:04:59Z'));

  expect([first[0]?.status, second[0]?.status]).toStrictEqual(['In Review', 'In Review']);
  expect(asked).toHaveLength(1);
});

test('an open issue is asked for again after 5 minutes and shows its new status', async () => {
  const asked: unknown[] = [],
    beforeLinear = makeLinearFake([buildIssue({})], [], asked),
    ctx = setupTest(),
    doneLinear = makeLinearFake([buildIssue({ status: 'Done', statusType: 'completed' })], [], asked),
    first = await loadReportIssues(beforeLinear, ctx.db, ['GEO-9801'], T0),
    second = await loadReportIssues(doneLinear, ctx.db, ['GEO-9801'], new Date('2026-10-15T02:05:01Z'));

  expect([first[0]?.status, second[0]?.status]).toStrictEqual(['In Review', 'Done']);
  expect(asked).toHaveLength(2);
});

test('a Done issue is not asked for again, however long after', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = makeLinearFake([buildIssue({ status: 'Done', statusType: 'completed' })], [], asked),
    first = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], T0),
    second = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], new Date('2026-12-15T02:00:00Z'));

  expect([first[0]?.status, second[0]?.status]).toStrictEqual(['Done', 'Done']);
  expect(asked).toHaveLength(1);
});

test('a Canceled issue is not asked for again', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = makeLinearFake([buildIssue({ status: 'Canceled', statusType: 'canceled' })], [], asked),
    first = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], T0),
    second = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], new Date('2026-12-15T02:00:00Z'));

  expect([first[0]?.status, second[0]?.status]).toStrictEqual(['Canceled', 'Canceled']);
  expect(asked).toHaveLength(1);
});

test('only the issues not kept are asked for, 100 to a query', async () => {
  const all = Array.from({ length: 251 }, (_unused, n) => buildIssue({ id: `GEO-${9000 + n}`, status: n === 0 ? 'Done' : 'In Review', statusType: n === 0 ? 'completed' : 'started' })),
    asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = makeLinearFake(all, [], asked),
    first = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9000'], T0),
    second = await loadReportIssues(
      fakeLinear,
      ctx.db,
      all.map((issue) => issue.id),
      new Date('2026-10-15T02:01:00Z'),
    );

  expect([first.length, second.length]).toStrictEqual([1, 251]);
  expect(asked.map((variables) => (variables as { ids: string[] }).ids.length)).toStrictEqual([1, 100, 100, 50]);
});

test('an id Linear does not return is left out and asked for again next time', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = makeLinearFake([], [], asked),
    first = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9999'], T0),
    second = await loadReportIssues(fakeLinear, ctx.db, ['GEO-9999'], new Date('2026-10-15T02:00:30Z'));

  expect([first, second]).toStrictEqual([[], []]);
  expect(asked).toHaveLength(2);
});

test('a kept issue in another shape is asked for again, and Linear\'s answer replaces it', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = makeLinearFake([buildIssue({ status: 'Done', statusType: 'completed' })], [], asked);
  ctx.db
    .query("INSERT INTO shipped_cache (kind, key, body, fetched_at, expires_at) VALUES ('issue', 'GEO-9801', ?, '2026-10-14T02:00:00Z', NULL)")
    .run(JSON.stringify({ id: 'GEO-9801', title: 'Fit the long spout', url: 'https://linear.example/issue/GEO-9801', status: 'Done', statusType: 'completed', project: 'Kettle', priority: 2 }));

  await expect(loadReportIssues(fakeLinear, ctx.db, ['GEO-9801'], T0)).resolves.toStrictEqual([buildIssue({ status: 'Done', statusType: 'completed' })]);
  expect(asked).toStrictEqual([{ ids: ['GEO-9801'] }]);
  expect(ctx.db.query("SELECT body FROM shipped_cache WHERE kind = 'issue'").all()).toStrictEqual([{ body: JSON.stringify(buildIssue({ status: 'Done', statusType: 'completed' })) }]);
});
