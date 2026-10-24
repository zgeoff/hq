import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { holdLanes } from './hold-lanes.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { removeLaneSkip } from './remove-lane-skip.ts';
import { tick } from './tick.ts';
import { validateLaneRules } from './validate-lane-rules.ts';
import { writeLaneSkip } from './write-lane-skip.ts';

// Three local slots and no imp ones: every look has free slots.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  const rules = validateLaneRules(rulesTable, null);
  const seedReady = async (seeds: ReadyNodeSeed[]): Promise<void> => {
    await readLinearReady(fresh.db, makePagedCall(buildReadyPage(seeds, null)), 'hq-lanes', rules, buildStubGitHubFactsRunner({}));
  };
  const skip = (issue: string, until: string): void => {
    writeLaneSkip(fresh.db, { issue, until, reason: 'waits on the kettle PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  };
  const sent = (): { target: string; text: string }[] => z.array(z.object({ target: z.string(), text: z.string() })).parse(fresh.db.query("SELECT target, text FROM outbox WHERE topic = 'lanes-all-skipped'").all());
  const told = (): unknown => fresh.db.query("SELECT count(*) AS total FROM events WHERE action = 'all-skipped'").get();
  const ready: ReadyNodeSeed[] = [
    { identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
    { identifier: 'GEO-9802', project: 'kettle roadmap', type: 'Bug', labels: ['vers'], priority: 3 },
  ];
  return { db: fresh.db, ready, sample, seedReady, skip, sent, told };
}

test('it tells z-delivery once when slots are free and every eligible Ready issue is skipped', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.ready);
  ctx.skip('GEO-9801', 'pr:impz#654');
  ctx.skip('GEO-9802', 'GEO-9899');

  tick(ctx.db, ctx.sample, 'hq-lanes');
  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.sent()).toStrictEqual([
    {
      target: 'z-delivery',
      text: 'Lanes: 3 slot(s) free, and every eligible Ready issue is skipped. Check each skip still holds: GEO-9801 until pr:impz#654: waits on the kettle PR; GEO-9802 until GEO-9899: waits on the kettle PR. Drop one with hq lanes skip drop <issue>.',
    },
  ]);
});

test('it tells again when the set of skips changes', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.ready);
  ctx.skip('GEO-9801', 'pr:impz#654');
  ctx.skip('GEO-9802', 'GEO-9899');
  tick(ctx.db, ctx.sample, 'hq-lanes');

  ctx.skip('GEO-9802', 'pr:impz#700');
  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.told()).toStrictEqual({ total: 2 });
});

test('it tells again in a new spell after an issue stops being skipped', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.ready);
  ctx.skip('GEO-9801', 'pr:impz#654');
  ctx.skip('GEO-9802', 'GEO-9899');
  tick(ctx.db, ctx.sample, 'hq-lanes');
  removeLaneSkip(ctx.db, 'GEO-9802', 'z-delivery');
  tick(ctx.db, ctx.sample, 'hq-lanes');
  ctx.skip('GEO-9802', 'GEO-9899');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.told()).toStrictEqual({ total: 2 });
});

test('it sends nothing while a lanes hold is active', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.ready);
  ctx.skip('GEO-9801', 'pr:impz#654');
  ctx.skip('GEO-9802', 'GEO-9899');
  holdLanes(ctx.db, 60, 'host switch', 'z-delivery');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.sent()).toStrictEqual([]);
});

test('it sends nothing while an eligible Ready issue is not skipped', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.ready);
  ctx.skip('GEO-9801', 'pr:impz#654');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.sent()).toStrictEqual([]);
});

test('it sends nothing while no slot is free', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.ready);
  ctx.skip('GEO-9801', 'pr:impz#654');
  ctx.skip('GEO-9802', 'GEO-9899');

  tick(ctx.db, { ...ctx.sample, slots: { imp: 0, local: 0 } }, 'hq-lanes');

  expect(ctx.sent()).toStrictEqual([]);
});

test('it lists at most 20 skips and counts the rest', async () => {
  const ctx = setupTest();
  const issues = Array.from({ length: 22 }, (_, index) => `GEO-${9900 + index}`);
  await ctx.seedReady(issues.map((identifier) => ({ identifier, project: 'kettle roadmap', type: 'Feature', labels: ['atc'] })));
  for (const issue of issues) {
    ctx.skip(issue, 'pr:impz#654');
  }

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.sent()[0]?.text).toInclude('; and 2 more. Drop one with');
});
