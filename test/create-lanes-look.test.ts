import { expect, onTestFinished, test } from 'bun:test';
import { getMeta } from '../src/db/get-meta.ts';
import { readReadySnapshot } from '../src/lanes/read-ready-snapshot.ts';
import { at, freshDb } from './helpers.ts';
import { createLanesLook } from './create-lanes-look.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-14T01:00:00Z');
  return { db: fresh.db, look: createLanesLook(fresh.db) };
}

test('it stores the given number of eligible Ready issues', async () => {
  const ctx = setupTest();

  await ctx.look.ready(2);

  expect(readReadySnapshot(ctx.db, new Date('2026-10-14T01:00:00Z'))?.eligible.map((issue) => issue.identifier)).toStrictEqual(['GEO-9800', 'GEO-9810']);
});

test('it stores the promotable count with a two-issue list, or none when the list is off', () => {
  const ctx = setupTest();

  ctx.look.promotable(2, '2026-10-14T01:00:00Z');
  const withList = getMeta(ctx.db, 'lanes_promotable_top');
  ctx.look.promotable(2, '2026-10-14T01:00:00Z', { list: false });

  expect(withList).toBe('{"at":"2026-10-14T01:00:00Z","focus":"[]","issues":[{"identifier":"GEO-9701","title":"whistle the kettle"},{"identifier":"GEO-9702","title":"descale the kettle"}]}');
  expect(getMeta(ctx.db, 'lanes_promotable_focus')).toBe('{"at":"2026-10-14T01:00:00Z","count":2,"focus":"[]","error":null}');
});

test('it reads no queued message from an empty outbox', () => {
  const ctx = setupTest();

  expect([ctx.look.lowWater(), ctx.look.stalled()]).toStrictEqual([[], []]);
});
