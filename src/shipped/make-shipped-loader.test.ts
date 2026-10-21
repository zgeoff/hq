import { expect, onTestFinished, test } from 'bun:test';
import { buildMergedDayOutput } from '../../test/build-merged-day-output.ts';
import { buildRenderedReport } from '../../test/build-rendered-report.ts';
import { buildStubDeliveryRunner } from '../../test/build-stub-delivery-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import type { Runner } from '../runner/types.ts';
import { makeShippedLoader } from './make-shipped-loader.ts';

// The clock reads 13:00 on Thursday 15 Oct 2026 in Sydney.
function setupTest() {
  const days = {
      '2026-10-12': buildMergedDayOutput('2026-10-12', []),
      '2026-10-13': buildMergedDayOutput('2026-10-13', []),
      '2026-10-14': buildMergedDayOutput('2026-10-14', []),
      '2026-10-15': buildMergedDayOutput('2026-10-15', []),
    },
    fresh = freshDb(),
    makeLoader = (run: Runner) => makeShippedLoader({ db: fresh.db, run, call: () => Promise.resolve({}), scripts: '/kettle/scripts' }),
    rendered = JSON.stringify(buildRenderedReport());
  onTestFinished(fresh.cleanup);
  at('2026-10-15T02:00:00Z');
  return { days, makeLoader, rendered };
}

test('after a restart, the week asks only for today, because the earlier days are on disk', async () => {
  const ctx = setupTest(),
    first = buildStubDeliveryRunner({ days: ctx.days, rendered: ctx.rendered }),
    second = buildStubDeliveryRunner({ days: ctx.days, rendered: ctx.rendered });

  await ctx.makeLoader(first.run)('week');
  await ctx.makeLoader(second.run)('week');

  expect(first.merged).toHaveLength(4);
  expect(second.merged).toStrictEqual([['daily', '2026-10-15']]);
});

test('today is read again on every load, though the last was seconds ago', async () => {
  const ctx = setupTest(),
    fake = buildStubDeliveryRunner({ days: ctx.days, rendered: ctx.rendered }),
    load = ctx.makeLoader(fake.run);

  await load('today');
  at('2026-10-15T02:00:10Z');
  await load('today');

  expect(fake.merged).toStrictEqual([
    ['daily', '2026-10-15'],
    ['daily', '2026-10-15'],
  ]);
});

test('Sydney midnight makes the new day\'s report from the new day', async () => {
  const ctx = setupTest(),
    fake = buildStubDeliveryRunner({ days: { ...ctx.days, '2026-10-16': buildMergedDayOutput('2026-10-16', []) }, rendered: ctx.rendered }),
    load = ctx.makeLoader(fake.run);

  at('2026-10-15T12:58:00Z');
  await load('today');
  at('2026-10-15T13:01:00Z');
  await load('today');

  expect(fake.merged).toStrictEqual([
    ['daily', '2026-10-15'],
    ['daily', '2026-10-16'],
  ]);
});

test('a failed read is not kept: the next request tries again', async () => {
  const ctx = setupTest(),
    first = buildStubDeliveryRunner({ days: {}, rendered: ctx.rendered }),
    mended = buildStubDeliveryRunner({ days: ctx.days, rendered: ctx.rendered }),
    outcome = await ctx.makeLoader(first.run)('week').then(
      () => null,
      (error: unknown) => (error as Error).message,
    ),
    recovered = await ctx.makeLoader(mended.run)('week');

  expect([outcome, recovered.report.dateLabel, mended.merged.length]).toStrictEqual(['merged-prs.sh exited 1: gh: offline', 'Thursday 15 October', 4]);
});
