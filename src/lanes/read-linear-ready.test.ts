import { expect, mock, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { readySummary } from '../areas/ready-summary.ts';
import { readReadyByLane } from '../areas/read-ready-by-lane.ts';
import { reportLaneReady } from '../areas/report-lane-ready.ts';
import type { LinearCall } from '../linear/types.ts';
import { getMeta } from '../db/get-meta.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { validateLaneRules } from './validate-lane-rules.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  return { db: fresh.db };
}

test('it sums two pages into one report', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const call = makePagedCall(
    buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }, { identifier: 'GEO-2' }], 'cursor-1'),
    buildReadyPage([{ identifier: 'GEO-3', project: 'atc maintenance' }, { identifier: 'GEO-4', project: 'hq roadmap' }], null),
  );

  await readLinearReady(ctx.db, call, 'hq-lanes', rules);

  const counts = readReadyByLane(ctx.db, 30);

  expect(counts['atc']?.n).toBe(2);
  expect(counts['flexible']?.n).toBe(1);
  expect(counts['cleanup']?.n).toBe(0);
  expect(counts['nixie-slice']?.n).toBe(0);
  expect(counts['nixie-maintenance']?.n).toBe(0);
  expect(readySummary(ctx.db, 30)).toMatchObject({ total: 4, eligible: 3, unexplained: 0, skipped: [{ issue: 'GEO-4', reason: 'hq: z-q builds hq' }] });
});

test('it leaves nothing unexplained when more than 100 issues are skipped', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const seeds = Array.from({ length: 103 }, (_, index) => ({ identifier: `GEO-${index + 1}`, project: 'hq roadmap' }));
  const call = makePagedCall(buildReadyPage([...seeds, { identifier: 'GEO-500', project: 'atc roadmap' }], null));

  await readLinearReady(ctx.db, call, 'hq-lanes', rules);

  const summary = readySummary(ctx.db, 30);

  expect(summary).toMatchObject({ total: 101, eligible: 1, unexplained: 0 });
  expect(summary?.skipped).toHaveLength(100);
});

test('it keeps the previous counts and their time when page 2 fails', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  reportLaneReady(ctx.db, { atc: 7 }, 'z-delivery');
  const before = getMeta(ctx.db, 'lanes_ready_by_lane');
  at('2026-10-15T20:05:00Z');
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], 'cursor-1'), new Error('Linear answered 502: invented outage'));

  await expect(readLinearReady(ctx.db, call, 'hq-lanes', rules)).rejects.toThrow('invented outage');

  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBe(before);
});

test('it logs a report only when the counts or the skipped issues change', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }, { identifier: 'GEO-4', project: 'hq roadmap' }], null));
  const fewer = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null));

  await readLinearReady(ctx.db, call, 'hq-lanes', rules);
  at('2026-10-15T20:10:00Z');
  await readLinearReady(ctx.db, call, 'hq-lanes', rules);
  const unchanged = ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'ready-by-lane'").get();
  await readLinearReady(ctx.db, fewer, 'hq-lanes', rules);

  expect(unchanged).toStrictEqual({ total: 1 });
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'ready-by-lane'").get()).toStrictEqual({ total: 2 });
});

test('it refreshes the counts time on an unchanged read, so the counts stay fresh', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null));

  await readLinearReady(ctx.db, call, 'hq-lanes', rules);
  at('2026-10-15T20:25:00Z');
  await readLinearReady(ctx.db, call, 'hq-lanes', rules);

  const atc = readReadyByLane(ctx.db, 30)['atc'];

  expect(atc?.n).toBe(1);
  expect(atc?.at).toBe('2026-10-15T20:25:00Z');
});

test('it lets a hand report write, and the next pass overwrites it', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  reportLaneReady(ctx.db, { atc: 9 }, 'z-delivery', { total: 9, skipped: [] });
  const handCount = readReadyByLane(ctx.db, 30)['atc']?.n;
  at('2026-10-15T20:10:00Z');

  await readLinearReady(ctx.db, makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null)), 'hq-lanes', rules);

  expect(handCount).toBe(9);
  expect(readReadyByLane(ctx.db, 30)['atc']?.n).toBe(1);
});

test('it refuses to read past 20 pages, before request 21, and keeps the previous counts', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  reportLaneReady(ctx.db, { atc: 7 }, 'z-delivery');
  const before = getMeta(ctx.db, 'lanes_ready_by_lane');
  at('2026-10-15T20:05:00Z');
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], 'cursor-1')));

  await expect(readLinearReady(ctx.db, call, 'hq-lanes', rules)).rejects.toThrow('more than 5000 Ready issues; hq reads no further');

  expect(call).toHaveBeenCalledTimes(20);
  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBe(before);
});

test('it refuses a malformed later page and keeps the previous counts', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  reportLaneReady(ctx.db, { atc: 7 }, 'z-delivery');
  const before = getMeta(ctx.db, 'lanes_ready_by_lane');
  at('2026-10-15T20:05:00Z');
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], 'cursor-1'), { issues: { nodes: [{ identifier: 7 }], pageInfo: { hasNextPage: false, endCursor: null } } });

  await expect(readLinearReady(ctx.db, call, 'hq-lanes', rules)).rejects.toThrow("Linear's Ready answer has an unexpected shape: issues.nodes.0.identifier");

  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBe(before);
});
