import { expect, mock, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeSkipStateCall } from '../../test/make-skip-state-call.ts';
import { readySummary } from '../areas/ready-summary.ts';
import { readReadyByLane } from '../areas/read-ready-by-lane.ts';
import { reportLaneReady } from '../areas/report-lane-ready.ts';
import type { LinearCall } from '../linear/types.ts';
import { getMeta } from '../db/get-meta.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { readReadySnapshot } from './read-ready-snapshot.ts';
import { readSkipUnread } from './read-skip-unread.ts';
import { validateLaneRules } from './validate-lane-rules.ts';
import { writeLaneSkip } from './write-lane-skip.ts';

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

  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

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

  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

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

  await expect(readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules })).rejects.toThrow('invented outage');

  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBe(before);
});

test('it logs a report only when the counts or the skipped issues change', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }, { identifier: 'GEO-4', project: 'hq roadmap' }], null));
  const fewer = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null));

  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  at('2026-10-15T20:10:00Z');
  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  const unchanged = ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'ready-by-lane'").get();
  await readLinearReady(ctx.db, { call: fewer, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(unchanged).toStrictEqual({ total: 1 });
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'ready-by-lane'").get()).toStrictEqual({ total: 2 });
});

test('it refreshes the counts time on an unchanged read, so the counts stay fresh', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null));

  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  at('2026-10-15T20:25:00Z');
  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

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

  await readLinearReady(ctx.db, { call: makePagedCall(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

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

  await expect(readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules })).rejects.toThrow('more than 5000 Ready issues; hq reads no further');

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

  await expect(readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules })).rejects.toThrow("Linear's Ready answer has an unexpected shape: issues.nodes.0.identifier");

  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBe(before);
});

test('it keeps the eligible Ready issues and the Design issues apart, and leaves the other exclusions out', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  const call = makePagedCall(
    buildReadyPage(
      [
        { identifier: 'GEO-9801', project: 'atc roadmap', labels: ['atc'] },
        { identifier: 'GEO-9802', labels: ['Design', 'nixie'] },
        { identifier: 'GEO-9803', project: 'hq roadmap', labels: ['hq'] },
      ],
      null,
    ),
  );

  await readLinearReady(ctx.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  const snapshot = readReadySnapshot(ctx.db);

  expect(snapshot?.eligible.map((issue) => issue.identifier)).toStrictEqual(['GEO-9801']);
  expect(snapshot?.design.map((issue) => issue.identifier)).toStrictEqual(['GEO-9802']);
  expect(JSON.parse(getMeta(ctx.db, 'lanes_issue_areas') ?? 'null')).toStrictEqual({ 'GEO-9801': ['atc'], 'GEO-9802': ['nixie'] });
});

test('it treats the Ready issues as unknown once the read is 30 min old', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  await readLinearReady(ctx.db, { call: makePagedCall(buildReadyPage([{ identifier: 'GEO-9801' }], null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  at('2026-10-15T20:31:00Z');

  expect(readReadySnapshot(ctx.db)).toBeNull();
});

test('it keeps the areas of a running issue after it leaves Ready', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  await readLinearReady(ctx.db, { call: makePagedCall(buildReadyPage([{ identifier: 'GEO-9801', labels: ['nixie'] }, { identifier: 'GEO-9802', labels: ['vers'] }], null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  ctx.db.query("INSERT INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-9801', 'Polish the kettle', 'imp', 'working', '2026-10-15T20:00:00Z', '2026-10-15T20:00:00Z')").run();
  at('2026-10-15T20:10:00Z');

  await readLinearReady(ctx.db, { call: makePagedCall(buildReadyPage([], null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(JSON.parse(getMeta(ctx.db, 'lanes_issue_areas') ?? 'null')).toStrictEqual({ 'GEO-9801': ['nixie'] });
});

test('it lists a skipped Ready issue among the skipped with its until and reason, in no lane', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9851', until: '2026-10-16T09:00:00Z', reason: 'the kettle vendor answers tomorrow', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9851', project: 'atc roadmap' }], {}), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readySummary(ctx.db, 30)).toMatchObject({ total: 1, eligible: 0, unexplained: 0, skipped: [{ issue: 'GEO-9851', reason: 'skipped until 2026-10-16T09:00:00Z: the kettle vendor answers tomorrow' }] });
});

test('it drops a skip until a time once the time passes, and counts the issue in its lane again', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9851', until: '2026-10-15T20:30:00Z', reason: 'the kettle vendor answers tonight', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  at('2026-10-15T20:31:00Z');

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9851', project: 'atc roadmap' }], {}), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db)).toStrictEqual([]);
  expect(readySummary(ctx.db, 30)).toMatchObject({ total: 1, eligible: 1, skipped: [] });
  expect(ctx.db.query("SELECT actor, data FROM events WHERE action = 'skip-ended'").all()).toStrictEqual([
    { actor: 'hq-lanes', data: JSON.stringify({ issue: 'GEO-9851', until: '2026-10-15T20:30:00Z', reason: 'the kettle vendor answers tonight' }) },
  ]);
});

test('it drops a skip until an issue once Linear reads that issue Done', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'GEO-9859', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], { 'GEO-9859': 'completed' }), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db)).toStrictEqual([]);
  expect(readySummary(ctx.db, 30)).toMatchObject({ total: 1, eligible: 1, skipped: [] });
});

test('it keeps a skip until an issue that Linear reads still open', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'GEO-9859', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], { 'GEO-9859': 'started' }), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db).map((skip) => skip.issue)).toStrictEqual(['GEO-9852']);
});

test('it keeps a skip until an issue when the state read fails, and still writes the Ready counts', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'GEO-9859', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], new Error('Linear answered 502: invented outage')), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db)).toStrictEqual([{ issue: 'GEO-9852', until: 'GEO-9859', reason: 'waits on the descaler PR', by: 'z-delivery', at: '2026-10-15T20:00:00Z' }]);
  expect(readySummary(ctx.db, 30)).toMatchObject({ total: 1, eligible: 0, skipped: [{ issue: 'GEO-9852', reason: 'skipped until GEO-9859: waits on the descaler PR' }] });
  expect(readSkipUnread(ctx.db)).toStrictEqual({ 'GEO-9859': "can't read issue:GEO-9859: Linear answered 502: invented outage" });
});

test('it keeps a skip until an issue Linear does not hold, and records why', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'GEO-9859', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], {}), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db).map((skip) => skip.issue)).toStrictEqual(['GEO-9852']);
  expect(readSkipUnread(ctx.db)).toStrictEqual({ 'GEO-9859': 'Linear has no issue GEO-9859' });
});

test('it clears an unread until issue once a later read answers for it', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'GEO-9859', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], new Error('Linear answered 502: invented outage')), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  at('2026-10-15T20:10:00Z');

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], { 'GEO-9859': 'started' }), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });

  expect(readSkipUnread(ctx.db)).toStrictEqual({});
});

test('it keeps a skip until a PR that GitHub shows open', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'pr:zgeoff/impz#654', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  const run = buildStubGitHubFactsRunner({ views: { 'impz#654': JSON.stringify({ state: 'OPEN' }) } });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], {}), run, actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db).map((skip) => skip.until)).toStrictEqual(['pr:impz#654']);
  expect(readSkipUnread(ctx.db)).toStrictEqual({});
});

test('it ends a skip until a PR once that PR merges, and logs the end', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'pr:zgeoff/impz#654', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  const run = buildStubGitHubFactsRunner({ views: { 'impz#654': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-15T20:20:00Z', mergeCommit: { oid: 'a'.repeat(40) } }) } });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], {}), run, actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db)).toStrictEqual([]);
  expect(ctx.db.query("SELECT actor, data FROM events WHERE action = 'skip-ended'").all()).toStrictEqual([
    { actor: 'hq-lanes', data: JSON.stringify({ issue: 'GEO-9852', until: 'pr:impz#654', reason: 'waits on the descaler PR' }) },
  ]);
});

test('it ends a skip until a PR once that PR closes unmerged', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'pr:impz#654', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  const run = buildStubGitHubFactsRunner({ views: { 'impz#654': JSON.stringify({ state: 'CLOSED' }) } });

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], {}), run, actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db)).toStrictEqual([]);
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'skip-ended'").get()).toStrictEqual({ total: 1 });
});

test('it keeps a skip until a PR that gh cannot read, and records why', async () => {
  const ctx = setupTest();
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));
  writeLaneSkip(ctx.db, { issue: 'GEO-9852', until: 'pr:impz#654', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  const run = buildStubGitHubFactsRunner({});

  await readLinearReady(ctx.db, { call: makeSkipStateCall([{ identifier: 'GEO-9852', project: 'atc roadmap' }], {}), run, actor: 'hq-lanes', rules });

  expect(readLaneSkips(ctx.db).map((skip) => skip.until)).toStrictEqual(['pr:impz#654']);
  expect(readSkipUnread(ctx.db)).toStrictEqual({ 'pr:impz#654': "impz#654: can't read it (gh exit 1): invented: no such PR" });
});
