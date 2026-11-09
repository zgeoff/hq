// oxlint-disable zgeoff/test-beside-module -- the whole-program lanes suite, across src/areas, src/lanes and src/capacity
import { expect, onTestFinished, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { getMeta } from '../src/db/get-meta.ts';
import { listEvents } from '../src/list-events.ts';
import { readOutboxRows } from '../src/outbox/read-outbox-rows.ts';
import { checkLane } from '../src/areas/check-lane.ts';
import { laneArgs } from '../src/areas/lane-args.ts';
import { parkedRuns } from '../src/areas/parked-runs.ts';
import { parseLanes } from '../src/areas/parse-lanes.ts';
import { parseReadyTotal } from '../src/areas/parse-ready-total.ts';
import { parseReady } from '../src/areas/parse-ready.ts';
import { parseSkipped } from '../src/areas/parse-skipped.ts';
import { readReadyByLane } from '../src/areas/read-ready-by-lane.ts';
import { readySummary } from '../src/areas/ready-summary.ts';
import { recordAwake } from '../src/areas/record-awake.ts';
import { reportLaneReady } from '../src/areas/report-lane-ready.ts';
import { runningByLane } from '../src/areas/running-by-lane.ts';
import { setRunLane } from '../src/areas/set-run-lane.ts';
import { skippedLines } from '../src/areas/skipped-lines.ts';
import { eligibleNow } from '../src/lanes/eligible-now.ts';
import { idleSlotMinutes } from '../src/lanes/idle-slot-minutes.ts';
import { reportReady } from '../src/lanes/report-ready.ts';
import { formatLineRoom } from '../src/lanes/format-line-room.ts';
import { loadImpRoom } from '../src/lanes/load-imp-room.ts';
import { parsePacingSlots } from '../src/lanes/parse-pacing-slots.ts';
import { readLanesSamples } from '../src/lanes/read-lanes-samples.ts';
import { readSlotPlan } from '../src/lanes/read-slot-plan.ts';
import { tick } from '../src/lanes/tick.ts';
import { checkReadyStale } from '../src/lanes/check-ready-stale.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { dailyText } from '../src/goals/daily/daily-text.ts';
import { addNote } from '../src/runs/add-note.ts';
import { addRun } from '../src/runs/add-run.ts';
import { setState } from '../src/runs/set-state.ts';
import { setCapacitySetting } from '../src/capacity/set-capacity-setting.ts';
import { buildReadyIssue } from './build-ready-issue.ts';
import { createCapacitySample } from './create-capacity-sample.ts';
import { at, freshDb } from './helpers.ts';

const T0 = '2026-10-16T01:00:00Z';
const atMin = (m: number) => at(new Date(Date.parse(T0) + m * 60_000).toISOString());
const PACING = { lanes: { imp: { 'nixie-slice': 3, 'nixie-maintenance': 2, atc: 2, imp: 2, cloud: 1 }, local: { flexible: 2 } } };
const LANES = parseLanes(PACING);
// oxlint-disable-next-line zgeoff/setup-test-only -- the pacing slots every lane test reads
const SLOTS = parsePacingSlots(PACING);
const cap = (freeMib: number) => ({ imp: { freeMib, room: true }, providers: { claude: { room: true, unattended: true, target: 'imp' } } });
// oxlint-disable-next-line zgeoff/setup-test-only, zgeoff/no-top-level-arrow -- the capacity reading every tick test passes
const sample = (freeMib: number) => ({ cap: cap(freeMib), impMib: 2048, error: null, lanes: LANES, slots: SLOTS });

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const db: Database = fresh.db;

  return {
    db,
    addRun: (issue: string, lane: string | null, place: 'imp' | 'local' = 'imp') =>
      addRun(db, { issue, title: 'Invented kettle work', place, session: null, next: 'Agent working.', gate: null, geoffChat: false, lane, actor: 'z-delivery' }),
  };
}

test('reads the lanes from pacing.json, and refuses a bad config', () => {
  expect(LANES.map((lane) => `${lane.place}:${lane.name}:${lane.size}`)).toStrictEqual(['imp:nixie-slice:3', 'imp:nixie-maintenance:2', 'imp:atc:2', 'imp:imp:2', 'imp:cloud:1', 'local:flexible:2']);
  for (const bad of [{}, { lanes: {} }, { lanes: { moon: { a: 1 } } }, { lanes: { imp: { 'Bad Name': 1 } } }, { lanes: { imp: { a: -1 } } }, { lanes: { imp: { a: 1.5 } } }, { lanes: { imp: { a: 1 }, local: { a: 1 } } }, null]) {
    expect(() => parseLanes(bad)).toThrow();
  }
});

const HOSTILE_LANES = ['NIXIE-SLICE', 'nixie', 'flexible; DROP TABLE runs', '', 'atc ', '../atc'];
test.each(HOSTILE_LANES)('--lane refuses %p', (raw) => expect(() => checkLane(LANES, raw)).toThrow('--lane must be one of'));
const HOSTILE_READY: [string, string][] = [
  ['atc', "isn't one"],
  ['atc=-1', "isn't one"],
  ['atc=1.5', "isn't one"],
  ['atc=99999', "isn't one"],
  ['moon=1', '--lane must be one of'],
  ['atc=1,atc=2', 'twice'],
  [',', 'at least one'],
];
test.each(HOSTILE_READY)('--lane for Ready refuses %p', (raw, why) => expect(() => parseReady(LANES, raw)).toThrow(why));

test('running counts by lane; a local run with no lane is flexible; a lane note sets the lane', () => {
  const ctx = setupTest();
  atMin(0);
  ctx.addRun('GEO-1', 'atc');
  ctx.addRun('GEO-2', null, 'local');
  ctx.addRun('GEO-3', null);
  ctx.addRun('GEO-4', 'atc');
  setState(ctx.db, 'GEO-4', 'merged', {}, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-5', title: 'Invented', place: 'none', session: null, next: 'x', gate: null, geoffChat: false, actor: 'z-delivery' });
  addNote(ctx.db, 'GEO-3', 'nixie-slice', { label: 'lane', actor: 'z-delivery' });
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 1, flexible: 1, 'nixie-slice': 1 });
  setRunLane(ctx.db, 'GEO-3', 'cloud', 'z-delivery');
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 1, flexible: 1, cloud: 1 });
  expect(() => setRunLane(ctx.db, 'GEO-404', 'cloud', 'z-delivery')).toThrow('no run GEO-404');
});

test('a per-lane Ready report also sets the total; a total-only report keeps the per-lane counts and detail', () => {
  const ctx = setupTest();
  atMin(0);
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=2,flexible=1'), 'z-delivery', { total: 5, skipped: [{ issue: 'GEO-1', reason: 'invented reason' }] });
  expect(eligibleNow(ctx.db)).toStrictEqual({ count: 3, at: T0 });
  atMin(10);
  reportLaneReady(ctx.db, parseReady(LANES, 'cloud=4'), 'z-delivery');
  expect(eligibleNow(ctx.db)).toStrictEqual({ count: 7, at: '2026-10-16T01:10:00Z' });
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=2,flexible=1'), 'z-delivery', { total: 5, skipped: [{ issue: 'GEO-1', reason: 'invented reason' }] });
  atMin(20);
  reportReady(ctx.db, 9, 'z-delivery');
  expect(eligibleNow(ctx.db)).toStrictEqual({ count: 9, at: '2026-10-16T01:20:00Z' });
  // oxlint-disable-next-line eslint/id-length -- n is readReadyByLane's own field
  expect(readReadyByLane(ctx.db, 30)).toMatchObject({ atc: { n: 2 }, flexible: { n: 1 }, cloud: { n: 4 } });
  expect(readySummary(ctx.db, 30)).toMatchObject({ total: 5, eligible: 7, skipped: [{ issue: 'GEO-1', reason: 'invented reason' }] });
});

test('the total Ready count leaves out a lane count that has gone stale', () => {
  const ctx = setupTest();
  atMin(0);
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=2'), 'z-delivery');
  atMin(31);
  reportLaneReady(ctx.db, parseReady(LANES, 'cloud=4'), 'z-delivery');
  expect(eligibleNow(ctx.db)).toStrictEqual({ count: 4, at: '2026-10-16T01:31:00Z' });
});

test('Ready per lane goes stale after 30 min', () => {
  const ctx = setupTest();
  atMin(0);
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=2,flexible=0'), 'z-delivery');
  // oxlint-disable-next-line eslint/id-length -- n is readReadyByLane's own field
  expect(readReadyByLane(ctx.db, 30)).toMatchObject({ atc: { n: 2 }, flexible: { n: 0 } });
  atMin(31);
  expect(readReadyByLane(ctx.db, 30)['atc']?.n).toBeNull();
});

test('a reported 0 Ready stays fresh for its own, longer window', () => {
  const ctx = setupTest();
  atMin(0);
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=2,flexible=0'), 'z-delivery');
  atMin(31);
  // oxlint-disable-next-line eslint/id-length -- n is readReadyByLane's own field
  expect(readReadyByLane(ctx.db, 30, 180)).toMatchObject({ atc: { n: null }, flexible: { n: 0 } });
  atMin(181);
  expect(readReadyByLane(ctx.db, 30, 180)['flexible']?.n).toBeNull();
});

test('the watcher nudges with the picks after 10 min, and again only on a change or after 30 min', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  for (let offsetMin = -5; offsetMin <= 185; offsetMin += 5) {
    createCapacitySample(ctx.db, { at: new Date(Date.parse(T0) + offsetMin * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  }
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [buildReadyIssue('GEO-21', { priority: 2 }), buildReadyIssue('GEO-22', { priority: 3 })], design: [] }));
  expect(tick(ctx.db, sample(16_384), 'hq-lanes').nudged).toBe(false);
  atMin(10);
  const result = tick(ctx.db, sample(16_384), 'hq-lanes');
  expect(result.nudged).toBe(true);
  expect(readOutboxRows(ctx.db)[0]?.text).toBe(
    '10 slots free for 10 min (imp 8, local 2). Take, in this order: GEO-21, GEO-22. (hq lanes shows the plan, hq focus the focus; capacity.sh still picks the provider and where it runs, and you write the briefs.)',
  );
  atMin(15);
  expect(tick(ctx.db, sample(16_384), 'hq-lanes').why).toContain('nothing changed');
  ctx.addRun('GEO-21', 'nixie-slice');
  atMin(16);

  expect(tick(ctx.db, sample(16_384), 'hq-lanes').nudged).toBe(true);
  const nudges = readOutboxRows(ctx.db).filter((message) => message.text.includes('Take, in this order'));
  expect(nudges).toHaveLength(1);
  expect(nudges[0]?.text).toContain('Take, in this order: GEO-22.');
});

test('it starts no nudge for a Design issue alone, though the plan names it for the with-geoff lane', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  for (let offsetMin = -5; offsetMin <= 185; offsetMin += 5) {
    createCapacitySample(ctx.db, { at: new Date(Date.parse(T0) + offsetMin * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  }
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [], design: [buildReadyIssue('GEO-24', { type: 'Design' })] }));
  const withDesign = sample(16_384);
  tick(ctx.db, withDesign, 'hq-lanes');
  atMin(10);

  const result = tick(ctx.db, withDesign, 'hq-lanes');

  expect([readSlotPlan(ctx.db, withDesign)?.design.withGeoff.next, result.nudged, result.why, readOutboxRows(ctx.db)]).toStrictEqual([['GEO-24'], false, '10 slot(s) free, nothing eligible', []]);
});

test('the samples count the slots the plan fills from the first free minute; only the nudge waits', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: ['GEO-21', 'GEO-22', 'GEO-23'].map((issue) => buildReadyIssue(issue)), design: [] }));
  for (const m of [0, 5, 10]) {
    atMin(m);
    tick(ctx.db, { ...sample(0), lanes: LANES, slots: SLOTS }, 'hq-lanes');
  }
  expect(readLanesSamples(ctx.db).map((row) => row.slots)).toStrictEqual([2, 2, 2]);
  expect(idleSlotMinutes(ctx.db, 1).slotMinutes).toBe(20);
});

test('impd at its non-Nix line holds the pool\'s imp slots and says why; a stale reading holds them all', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  const reading = { cap: cap(8192), impMib: 2048, error: null, lanes: LANES, slots: SLOTS };
  const readImpFree = () => {
    const pool = readSlotPlan(ctx.db, reading)?.pool;
    return [pool?.impFree, pool?.held];
  };
  setCapacitySetting(ctx.db, 'nonnixMaxMib', null, 'z-delivery');
  createCapacitySample(ctx.db, { at: T0, nonnixAwakeMib: 14_336 });
  expect(readImpFree()).toStrictEqual([1, 'impd at line']);
  expect(formatLineRoom(loadImpRoom(ctx.db, { budgetSlots: 4, impMib: 2048 }))).toBe('impd non-Nix line: 14336/16384 MiB, 0/1000 vCPUs awake; impd budget 14336/1048576 MiB awake, 0 MiB kept for priority imps; 1 imp slot(s) to fill, set by impd at line');
  createCapacitySample(ctx.db, { at: T0, nonnixAwakeMib: 16_384 });
  expect(readImpFree()).toStrictEqual([0, 'impd at line']);
  expect(tick(ctx.db, reading, 'hq-lanes').slots).toBe(2);
  atMin(16);
  expect(readImpFree()).toStrictEqual([0, 'no fresh impd reading']);
  expect(formatLineRoom(loadImpRoom(ctx.db, { budgetSlots: 4, impMib: 2048 }))).toBe('impd non-Nix line: no fresh reading, so every imp slot is held');
});

test('with no lanes in pacing.json, the one imp pool is held under impd\'s non-Nix line too', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxMib', null, 'z-delivery');
  createCapacitySample(ctx.db, { at: T0, nonnixAwakeMib: 14_336 });
  expect(tick(ctx.db, { ...sample(8192), lanes: null, slots: null }, 'hq-lanes').slots).toBe(1);
  createCapacitySample(ctx.db, { at: T0, nonnixAwakeMib: 16_384 });
  expect(tick(ctx.db, { ...sample(8192), lanes: null, slots: null }, 'hq-lanes').slots).toBe(0);
});

test('hq run lane takes two words, one quoted word, or --lane', () => {
  expect(laneArgs(['GEO-3', 'cloud'], undefined)).toStrictEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(laneArgs(['GEO-3 cloud'], undefined)).toStrictEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(laneArgs(['GEO-3'], 'cloud')).toStrictEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(laneArgs(['GEO-3', 'cloud'], 'cloud')).toStrictEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(() => laneArgs(['GEO-3', 'cloud'], 'atc')).toThrow('the lane is given twice');
  expect(() => laneArgs(['GEO-3'], undefined)).toThrow('give the lane');
  expect(() => laneArgs([], 'cloud')).toThrow('give the issue');
  expect(() => laneArgs(['GEO-3', 'cloud', 'atc'], undefined)).toThrow('takes an issue and a lane');
});

test('a blocked run with no session awake is parked, whatever it waits on: its slot is free until it wakes or moves', () => {
  const ctx = setupTest();
  atMin(0);
  const withSession = (issue: string, session: string) =>
    addRun(ctx.db, { issue, title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'atc', actor: 'z-delivery' });
  withSession('GEO-1', '0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  withSession('GEO-2', '0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  withSession('GEO-3', '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  setState(ctx.db, 'GEO-1', 'blocked', { waitsOnGeoff: true }, 'z-delivery');

  setState(ctx.db, 'GEO-2', 'blocked', { waitsOn: 'a release' }, 'z-delivery');
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 3 });
  atMin(1);
  const asleep = { id: '0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { vm: 'asleep' } };
  recordAwake(ctx.db, [asleep, { id: '0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: false }, { id: '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([
    { issue: 'GEO-1', lane: 'atc' },
    { issue: 'GEO-2', lane: 'atc' },
  ]);
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 1 });
  recordAwake(ctx.db, [{ ...asleep, lifecycle: {} }, { id: '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }]);
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 2 });
  recordAwake(ctx.db, [{ id: '0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { harness: 'suspended' } }, { id: '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }]);
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 1 });

  recordAwake(ctx.db, [asleep, { id: '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }]);

  setState(ctx.db, 'GEO-1', 'working', {}, 'z-delivery');
  expect(parkedRuns(ctx.db)).toStrictEqual([
    { issue: 'GEO-1', lane: 'atc' },
    { issue: 'GEO-2', lane: 'atc' },
  ]);
  setState(ctx.db, 'GEO-1', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 1 });
  atMin(-1);
  expect(runningByLane(ctx.db)).toStrictEqual({ atc: 3 });
});

test('the sample records the eligible issues the Ready read holds, the hand count while it is stale, and unknown with neither', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  for (let offsetMin = -5; offsetMin <= 185; offsetMin += 5) {
    createCapacitySample(ctx.db, { at: new Date(Date.parse(T0) + offsetMin * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  }
  const eligible = () => readLanesSamples(ctx.db).map((row) => ({ eligible: row.eligible, slots: row.slots })).at(-1);
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [], design: [] }));
  tick(ctx.db, sample(16_384), 'hq-lanes');
  expect(eligible()).toStrictEqual({ eligible: 0, slots: 0 });
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [buildReadyIssue('GEO-21'), buildReadyIssue('GEO-22')], design: [] }));
  atMin(1);
  tick(ctx.db, sample(16_384), 'hq-lanes');
  expect(eligible()).toStrictEqual({ eligible: 2, slots: 2 });

  setMeta(ctx.db, 'lanes_ready_issues', null);
  atMin(2);
  tick(ctx.db, sample(16_384), 'hq-lanes');
  expect(eligible()).toStrictEqual({ eligible: null, slots: 10 });

  reportReady(ctx.db, 5, 'z-delivery');
  atMin(3);
  tick(ctx.db, sample(16_384), 'hq-lanes');
  expect(eligible()?.eligible).toBe(5);
});

const SK = 'GEO-1=blocked by GEO-9;GEO-2=needs a design call';

test('--skipped reads ISSUE=reason pairs and refuses the rest', () => {
  expect(parseSkipped(SK)).toStrictEqual([{ issue: 'GEO-1', reason: 'blocked by GEO-9' }, { issue: 'GEO-2', reason: 'needs a design call' }]);
  expect(parseSkipped("GEO-3=needs the owner's call; ")).toStrictEqual([{ issue: 'GEO-3', reason: "needs the owner's call" }]);
  expect(() => parseSkipped('geo-1=x')).toThrow('no issue like');
  expect(() => parseSkipped('GEO-1=')).toThrow('1 to 200');
  expect(() => parseSkipped('GEO-1')).toThrow('1 to 200');
  expect(() => parseSkipped(`GEO-1=${'x'.repeat(201)}`)).toThrow('1 to 200');
  expect(() => parseSkipped('GEO-1=a;GEO-1=b')).toThrow('twice');
  expect(() => parseSkipped(Array.from({ length: 101 }, (_, i) => `GEO-${i + 1}=r`).join(';'))).toThrow('at most 100');
  expect(parseSkipped(Array.from({ length: 100 }, (_, i) => `GEO-${i + 1}=r`).join(';'))).toHaveLength(100);
  expect(() => parseSkipped(' ; ')).toThrow('at least one');
  expect(parseReadyTotal('53')).toBe(53);
  expect(() => parseReadyTotal('-1')).toThrow();
});

test('the Ready detail is stored with the report, shown while fresh, and flags what is unexplained', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=0,flexible=0'), 'z-delivery', { total: 53, skipped: parseSkipped(SK) });
  const detail = getMeta(ctx.db, 'lanes_ready_detail');
  invariant(detail !== null);
  const event = listEvents(ctx.db, 'ready-by-lane')[0]?.data;
  expect(JSON.parse(detail)).toMatchObject({ total: 53, skipped: [{ issue: 'GEO-1' }, { issue: 'GEO-2' }] });
  expect(event).toContain('blocked by GEO-9');
  const summary = readySummary(ctx.db, 30);
  invariant(summary);
  expect(summary.line).toBe('Ready: 53 total, 0 eligible across lanes, 2 skipped with reasons, 51 unexplained UNEXPLAINED');
  expect(skippedLines(summary)).toStrictEqual(['  GEO-1: blocked by GEO-9', '  GEO-2: needs a design call']);
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=3,flexible=0'), 'z-delivery', { total: 5, skipped: parseSkipped(SK) });
  expect(readySummary(ctx.db, 30)?.line).toBe('Ready: 5 total, 3 eligible across lanes, 2 skipped with reasons, 0 unexplained');
  expect(dailyText(ctx.db, new Date(T0))).toContain('Ready: 5 total, 3 eligible');
  atMin(31);
  expect(readySummary(ctx.db, 30)).toBeNull();
  atMin(32);
  reportLaneReady(ctx.db, parseReady(LANES, 'atc=1'), 'z-delivery');
  expect(readySummary(ctx.db, 30)).toBeNull();
  const twelveSkipped = parseSkipped(Array.from({ length: 12 }, (_, index) => `GEO-${index + 1}=r`).join(';'));
  expect(skippedLines({ ...summary, skipped: twelveSkipped })).toHaveLength(11);
});

test('it frees the lane of a working run whose session is asleep or no longer listed, bar the grace of a session atc has not yet seen', () => {
  const ctx = setupTest();
  atMin(0);
  const withSession = (issue: string, session: string) =>
    addRun(ctx.db, { issue, title: 'Invented kettle work', place: 'local', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  withSession('GEO-7', '0000000e-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  withSession('GEO-8', '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  recordAwake(ctx.db, [{ id: '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { vm: 'asleep' } }]);

  // GEO-7's session is new: atc may not list it yet
  expect(runningByLane(ctx.db)).toStrictEqual({ flexible: 1 });
  atMin(6);
  recordAwake(ctx.db, [{ id: '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { vm: 'asleep' } }]);
  expect([parkedRuns(ctx.db), runningByLane(ctx.db)]).toStrictEqual([
    [
      { issue: 'GEO-7', lane: 'flexible' },
      { issue: 'GEO-8', lane: 'flexible' },
    ],
    { flexible: 0 },
  ]);

  atMin(22);
  expect(runningByLane(ctx.db)).toStrictEqual({ flexible: 2 });
});

test('a blocked run waiting on the owner whose session is idle 15 min holds no slot', () => {
  const ctx = setupTest();
  atMin(0);
  const id = '00000010-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(ctx.db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-9', lane: 'flexible', next: 'Agent working.', place: 'local', session: id, title: 'Invented teapot work' });
  setState(ctx.db, 'GEO-9', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  atMin(15);
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  expect(runningByLane(ctx.db)).toStrictEqual({ flexible: 0 });
});

test('a slot a gone session frees on imp stays held while impd is at its line', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  const reading = { cap: cap(8192), impMib: 2048, error: null, lanes: LANES, slots: SLOTS };
  addRun(ctx.db, { issue: 'GEO-10', title: 'Invented kettle work', place: 'imp', session: '00000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setCapacitySetting(ctx.db, 'nonnixMaxMib', null, 'z-delivery');
  atMin(6);
  createCapacitySample(ctx.db, { at: new Date(Date.parse(T0) + 6 * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 18_432 });
  recordAwake(ctx.db, []);
  expect([runningByLane(ctx.db), readSlotPlan(ctx.db, reading)?.pool]).toMatchObject([{ cloud: 0 }, { impRunning: 0, impFree: 0, held: 'impd at line' }]);
});

test('it parks a run whose awake session is idle 15 min, blocked or working; a turn counts it again', () => {
  const ctx = setupTest();
  atMin(0);
  const id = '0000000d-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(ctx.db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-4', lane: 'cloud', next: 'Agent working.', place: 'imp', session: id, title: 'Invented teapot work' });
  setState(ctx.db, 'GEO-4', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
  atMin(10);
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
  atMin(15);
  recordAwake(ctx.db, [{ alive: true, id, state: 'done' }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([{ issue: 'GEO-4', lane: 'cloud' }]);
  expect(runningByLane(ctx.db)).toStrictEqual({ cloud: 0 });
  atMin(20);
  recordAwake(ctx.db, [{ alive: true, id, state: 'running' }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
  atMin(25);
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
  atMin(40);
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([{ issue: 'GEO-4', lane: 'cloud' }]);
  setState(ctx.db, 'GEO-4', 'working', {}, 'z-delivery');
  expect(parkedRuns(ctx.db)).toStrictEqual([{ issue: 'GEO-4', lane: 'cloud' }]);
});

test('an awake session with no atc state still holds its slot, as before', () => {
  const ctx = setupTest();
  atMin(0);
  const id = '0000000e-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(ctx.db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-5', lane: 'atc', next: 'Agent working.', place: 'imp', session: id, title: 'Invented mug work' });
  setState(ctx.db, 'GEO-5', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(ctx.db, [{ alive: true, id }]);
  atMin(30);
  recordAwake(ctx.db, [{ alive: true, id }]);
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
});

test('a turn between two sweeps restarts the idle clock from atc\'s last activity', () => {
  const ctx = setupTest();
  atMin(0);
  const id = '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(ctx.db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-6', lane: 'imp', next: 'Agent working.', place: 'imp', session: id, title: 'Invented saucer work' });
  setState(ctx.db, 'GEO-6', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }]);
  atMin(15);
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }], new Map([[id, Date.parse(T0) + 9 * 60_000]]));
  expect(parkedRuns(ctx.db)).toStrictEqual([]);
  atMin(24);
  recordAwake(ctx.db, [{ alive: true, id, state: 'needs_you' }], new Map([[id, Date.parse(T0) + 9 * 60_000]]));
  expect(parkedRuns(ctx.db)).toStrictEqual([{ issue: 'GEO-6', lane: 'imp' }]);
});

test('the stale alert names the last Linear read\'s error and gives the hand report as the fallback', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  reportReady(ctx.db, 4, 'z-delivery');
  setMeta(ctx.db, 'lanes_ready_linear_error', 'Linear answered 401: invented failure');

  const alerted = checkReadyStale(ctx.db, new Date(Date.parse(T0) + 130 * 60_000), 3, 'hq-lanes');

  expect(alerted).toBe(true);

  expect(readOutboxRows(ctx.db)[0]?.text).toMatchInlineSnapshot(`"Lanes: 3 slot(s) free, and the newest Ready report is 2 h old (2026-10-16T01:00:00Z). The lanes can't tell how much work waits. hq's last read of Ready from Linear failed: Linear answered 401: invented failure. Until hq reads again, z-delivery reports Ready by hand with hq lanes ready --lane name=n,..."`);
});

test('the stale alert says hq has not read Ready from Linear when no read failed', () => {
  const ctx = setupTest();
  atMin(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  reportReady(ctx.db, 4, 'z-delivery');

  const alerted = checkReadyStale(ctx.db, new Date(Date.parse(T0) + 130 * 60_000), 3, 'hq-lanes');

  expect(alerted).toBe(true);

  expect(readOutboxRows(ctx.db)[0]?.text).toMatchInlineSnapshot(`"Lanes: 3 slot(s) free, and the newest Ready report is 2 h old (2026-10-16T01:00:00Z). The lanes can't tell how much work waits. hq has not read Ready from Linear since then. Until hq reads again, z-delivery reports Ready by hand with hq lanes ready --lane name=n,..."`);
});
