import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
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

let db: Database;
let cleanup: () => void;
const T0 = '2026-10-16T01:00:00Z';
const atMin = (m: number) => at(new Date(Date.parse(T0) + m * 60_000).toISOString());
const PACING = { lanes: { imp: { 'nixie-slice': 3, 'nixie-maintenance': 2, atc: 2, imp: 2, cloud: 1 }, local: { flexible: 2 } } };
const LANES = parseLanes(PACING);
// oxlint-disable-next-line zgeoff/setup-test-only -- this file's shared beforeEach state is GEO-1318's lint debt
const SLOTS = parsePacingSlots(PACING);
const cap = (freeMib: number) => ({ imp: { freeMib, room: true }, providers: { claude: { room: true, unattended: true, target: 'imp' } } });
// oxlint-disable-next-line zgeoff/setup-test-only, zgeoff/no-top-level-arrow -- this file's shared beforeEach state is GEO-1318's lint debt
const sample = (freeMib: number) => ({ cap: cap(freeMib), impMib: 2048, error: null, lanes: LANES, slots: SLOTS });
const run = (issue: string, lane: string | null, place: 'imp' | 'local' = 'imp') =>
  addRun(db, { issue, title: 'Invented kettle work', place, session: null, next: 'Agent working.', gate: null, geoffChat: false, lane, actor: 'z-delivery' });
const msgs = () => db.query('SELECT text FROM outbox').all() as { text: string }[];

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  atMin(0);

  // An impd reading every 5 min under raised lines, so the budget, not the line, sets the slots.
  setCapacitySetting(db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  for (let m = -5; m <= 185; m += 5) {
    createCapacitySample(db, { at: new Date(Date.parse(T0) + m * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  }
});
afterEach(() => cleanup());

test('reads the lanes from pacing.json, and refuses a bad config', () => {
  expect(LANES.map((l) => `${l.place}:${l.name}:${l.size}`)).toEqual(['imp:nixie-slice:3', 'imp:nixie-maintenance:2', 'imp:atc:2', 'imp:imp:2', 'imp:cloud:1', 'local:flexible:2']);
  for (const bad of [{}, { lanes: {} }, { lanes: { moon: { a: 1 } } }, { lanes: { imp: { 'Bad Name': 1 } } }, { lanes: { imp: { a: -1 } } }, { lanes: { imp: { a: 1.5 } } }, { lanes: { imp: { a: 1 }, local: { a: 1 } } }, null]) {
    expect(() => parseLanes(bad)).toThrow();
  }
});

// Lane names and Ready reports the commands must refuse.
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
  run('GEO-1', 'atc');
  run('GEO-2', null, 'local');
  run('GEO-3', null);
  run('GEO-4', 'atc');
  setState(db, 'GEO-4', 'merged', {}, 'z-delivery'); // past the merge: no longer holds a slot
  addRun(db, { issue: 'GEO-5', title: 'Invented', place: 'none', session: null, next: 'x', gate: null, geoffChat: false, actor: 'z-delivery' }); // no agent
  addNote(db, 'GEO-3', 'nixie-slice', 'lane', 'z-delivery');
  expect(runningByLane(db)).toEqual({ atc: 1, flexible: 1, 'nixie-slice': 1 });
  setRunLane(db, 'GEO-3', 'cloud', 'z-delivery');
  expect(runningByLane(db)).toEqual({ atc: 1, flexible: 1, cloud: 1 });
  expect(() => setRunLane(db, 'GEO-404', 'cloud', 'z-delivery')).toThrow('no run GEO-404');
});

test('a per-lane Ready report also sets the total; a total-only report keeps the per-lane counts and detail', () => {
  reportLaneReady(db, parseReady(LANES, 'atc=2,flexible=1'), 'z-delivery', { total: 5, skipped: [{ issue: 'GEO-1', reason: 'invented reason' }] });
  expect(eligibleNow(db)).toEqual({ count: 3, at: T0 });
  atMin(10);
  reportLaneReady(db, parseReady(LANES, 'cloud=4'), 'z-delivery');
  expect(eligibleNow(db)).toEqual({ count: 7, at: '2026-10-16T01:10:00Z' });
  reportLaneReady(db, parseReady(LANES, 'atc=2,flexible=1'), 'z-delivery', { total: 5, skipped: [{ issue: 'GEO-1', reason: 'invented reason' }] });
  atMin(20);
  reportReady(db, 9, 'z-delivery');
  expect(eligibleNow(db)).toEqual({ count: 9, at: '2026-10-16T01:20:00Z' });
  expect(readReadyByLane(db, 30)).toMatchObject({ atc: { n: 2 }, flexible: { n: 1 }, cloud: { n: 4 } });
  expect(readySummary(db, 30)).toMatchObject({ total: 5, eligible: 7, skipped: [{ issue: 'GEO-1', reason: 'invented reason' }] });
});

test('the total Ready count leaves out a lane count that has gone stale', () => {
  reportLaneReady(db, parseReady(LANES, 'atc=2'), 'z-delivery');
  atMin(31);
  reportLaneReady(db, parseReady(LANES, 'cloud=4'), 'z-delivery');
  expect(eligibleNow(db)).toEqual({ count: 4, at: '2026-10-16T01:31:00Z' });
});

test('Ready per lane goes stale after 30 min', () => {
  reportLaneReady(db, parseReady(LANES, 'atc=2,flexible=0'), 'z-delivery');
  expect(readReadyByLane(db, 30)).toMatchObject({ atc: { n: 2 }, flexible: { n: 0 } });
  atMin(31);
  expect(readReadyByLane(db, 30)['atc']?.n).toBeNull();
});

test('a reported 0 Ready stays fresh for its own, longer window', () => {
  reportLaneReady(db, parseReady(LANES, 'atc=2,flexible=0'), 'z-delivery');
  atMin(31);
  expect(readReadyByLane(db, 30, 180)).toMatchObject({ atc: { n: null }, flexible: { n: 0 } });
  atMin(181);
  expect(readReadyByLane(db, 30, 180)['flexible']?.n).toBeNull();
});

test('the watcher nudges with the picks after 10 min, and again only on a change or after 30 min', () => {
  setMeta(db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [buildReadyIssue('GEO-21', { priority: 2 }), buildReadyIssue('GEO-22', { priority: 3 })], design: [] }));
  expect(tick(db, sample(16384), 'hq-lanes').nudged).toBe(false);
  atMin(10);
  const r = tick(db, sample(16384), 'hq-lanes');
  expect(r.nudged).toBe(true);
  expect(msgs()[0]?.text).toBe(
    '10 slots free for 10 min (imp 8, local 2). Take, in this order: GEO-21, GEO-22. (hq lanes shows the plan, hq focus the focus; capacity.sh still picks the provider and where it runs, and you write the briefs.)',
  );
  atMin(15);
  expect(tick(db, sample(16384), 'hq-lanes').why).toContain('nothing changed');
  run('GEO-21', 'nixie-slice');
  atMin(16);

  // A launch took GEO-21, so the picks changed; the newer nudge replaced the unsent one.
  expect(tick(db, sample(16_384), 'hq-lanes').nudged).toBe(true);
  expect(msgs()).toHaveLength(1);
  expect(msgs()[0]?.text).toContain('Take, in this order: GEO-22.');
});

test('a Design issue alone starts no nudge, though the plan names it for the design slot', () => {
  setMeta(db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [], design: [buildReadyIssue('GEO-24', { type: 'Design' })] }));
  const withDesign = { ...sample(16_384), cap: { ...cap(16_384), design: { room: true } } };
  tick(db, withDesign, 'hq-lanes');
  atMin(10);

  const result = tick(db, withDesign, 'hq-lanes');

  expect([readSlotPlan(db, withDesign)?.design, result.nudged, result.why, msgs()]).toStrictEqual(['GEO-24', false, '10 slot(s) free, nothing eligible', []]);
});

test('the samples count the slots the plan fills from the first free minute; only the nudge waits', () => {
  setMeta(db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: ['GEO-21', 'GEO-22', 'GEO-23'].map((issue) => buildReadyIssue(issue)), design: [] }));
  for (const m of [0, 5, 10]) {
    atMin(m);
    tick(db, { ...sample(0), lanes: LANES, slots: SLOTS }, 'hq-lanes');
  }
  expect((db.query('SELECT slots FROM lanes_samples ORDER BY seq').all() as { slots: number }[]).map((r) => r.slots)).toEqual([2, 2, 2]);
  expect(idleSlotMinutes(db, 1).slotMinutes).toBe(20);
});

test('impd at its non-Nix line holds the pool\'s imp slots and says why; a stale reading holds them all', () => {
  const reading = { cap: cap(8192), impMib: 2048, error: null, lanes: LANES, slots: SLOTS };
  const readImpFree = () => {
    const pool = readSlotPlan(db, reading)?.pool;
    return [pool?.impFree, pool?.held];
  };
  db.query('DELETE FROM capacity_samples').run();
  setCapacitySetting(db, 'nonnixMaxMib', null, 'z-delivery');
  createCapacitySample(db, { at: T0, nonnixAwakeMib: 14_336 });
  expect(readImpFree()).toStrictEqual([1, 'impd at line']);
  expect(formatLineRoom(loadImpRoom(db, { budgetSlots: 4, impMib: 2048 }))).toBe('impd non-Nix line: 14336/16384 MiB, 0/1000 vCPUs awake; 1 imp slot(s) to fill, set by impd at line');
  createCapacitySample(db, { at: T0, nonnixAwakeMib: 16_384 });
  expect(readImpFree()).toStrictEqual([0, 'impd at line']);
  expect(tick(db, reading, 'hq-lanes').slots).toBe(2);
  atMin(16);
  expect(readImpFree()).toStrictEqual([0, 'no fresh impd reading']);
  expect(formatLineRoom(loadImpRoom(db, { budgetSlots: 4, impMib: 2048 }))).toBe('impd non-Nix line: no fresh reading, so every imp slot is held');
});

test('with no lanes in pacing.json, the one imp pool is held under impd\'s non-Nix line too', () => {
  db.query('DELETE FROM capacity_samples').run();
  setCapacitySetting(db, 'nonnixMaxMib', null, 'z-delivery');
  createCapacitySample(db, { at: T0, nonnixAwakeMib: 14_336 });
  expect(tick(db, { ...sample(8192), lanes: null, slots: null }, 'hq-lanes').slots).toBe(1);
  createCapacitySample(db, { at: T0, nonnixAwakeMib: 16_384 });
  expect(tick(db, { ...sample(8192), lanes: null, slots: null }, 'hq-lanes').slots).toBe(0);
});

test('hq run lane takes two words, one quoted word, or --lane', () => {
  expect(laneArgs(['GEO-3', 'cloud'], undefined)).toEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(laneArgs(['GEO-3 cloud'], undefined)).toEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(laneArgs(['GEO-3'], 'cloud')).toEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(laneArgs(['GEO-3', 'cloud'], 'cloud')).toEqual({ key: 'GEO-3', lane: 'cloud' });
  expect(() => laneArgs(['GEO-3', 'cloud'], 'atc')).toThrow('the lane is given twice');
  expect(() => laneArgs(['GEO-3'], undefined)).toThrow('give the lane');
  expect(() => laneArgs([], 'cloud')).toThrow('give the issue');
  expect(() => laneArgs(['GEO-3', 'cloud', 'atc'], undefined)).toThrow('takes an issue and a lane');
});

test('a blocked run with no session awake is parked, whatever it waits on: its slot is free until it wakes or moves', () => {
  const withSession = (issue: string, session: string) =>
    addRun(db, { issue, title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'atc', actor: 'z-delivery' });
  withSession('GEO-1', '0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  withSession('GEO-2', '0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  withSession('GEO-3', '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  setState(db, 'GEO-1', 'blocked', { waitsOnGeoff: true }, 'z-delivery');

  // Blocked, but not on the owner.
  setState(db, 'GEO-2', 'blocked', { waitsOn: 'a release' }, 'z-delivery');
  expect(parkedRuns(db)).toEqual([]); // no atc reading yet: every run counts
  expect(runningByLane(db)).toEqual({ atc: 3 });
  const asleep = { id: '0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { vm: 'asleep' } };
  recordAwake(db, [asleep, { id: '0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: false }, { id: '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }]);
  expect(parkedRuns(db)).toEqual([
    { issue: 'GEO-1', lane: 'atc' },
    { issue: 'GEO-2', lane: 'atc' },
  ]);
  expect(runningByLane(db)).toEqual({ atc: 1 });
  recordAwake(db, [{ ...asleep, lifecycle: {} }]); // its session woke: it counts again
  expect(runningByLane(db)).toEqual({ atc: 2 });
  recordAwake(db, [{ id: '0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { harness: 'suspended' } }]);
  expect(runningByLane(db)).toEqual({ atc: 1 });
  atMin(16); // the reading is over 15 min old: every run counts
  expect(runningByLane(db)).toEqual({ atc: 3 });

  // GEO-2's session is gone
  recordAwake(db, [asleep, { id: '0000000c-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }]);

  // The owner answered.
  setState(db, 'GEO-1', 'working', {}, 'z-delivery');
  expect(parkedRuns(db)).toEqual([{ issue: 'GEO-2', lane: 'atc' }]);
  setState(db, 'GEO-1', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  expect(runningByLane(db)).toEqual({ atc: 1 });
  atMin(-1); // a reading from the future proves nothing
  expect(runningByLane(db)).toEqual({ atc: 3 });
});

test('the sample records the eligible issues the Ready read holds, the hand count while it is stale, and unknown with neither', () => {
  const eligible = () => (db.query('SELECT eligible, slots FROM lanes_samples ORDER BY seq DESC LIMIT 1').get() as { eligible: number | null; slots: number });
  setMeta(db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [], design: [] }));
  tick(db, sample(16384), 'hq-lanes');
  expect(eligible()).toStrictEqual({ eligible: 0, slots: 0 });
  setMeta(db, 'lanes_ready_issues', JSON.stringify({ at: T0, eligible: [buildReadyIssue('GEO-21'), buildReadyIssue('GEO-22')], design: [] }));
  atMin(1);
  tick(db, sample(16384), 'hq-lanes');
  expect(eligible()).toStrictEqual({ eligible: 2, slots: 2 });

  // No Ready read and no hand report: unknown, and every free slot counts.
  db.query("DELETE FROM meta WHERE key = 'lanes_ready_issues'").run();
  atMin(2);
  tick(db, sample(16384), 'hq-lanes');
  expect(eligible()).toStrictEqual({ eligible: null, slots: 10 });

  // A hand report stands in while the read is missing.
  reportReady(db, 5, 'z-delivery');
  atMin(3);
  tick(db, sample(16384), 'hq-lanes');
  expect(eligible().eligible).toBe(5);
});

const SK = 'GEO-1=blocked by GEO-9;GEO-2=needs a design call';

test('--skipped reads ISSUE=reason pairs and refuses the rest', () => {
  expect(parseSkipped(SK)).toEqual([{ issue: 'GEO-1', reason: 'blocked by GEO-9' }, { issue: 'GEO-2', reason: 'needs a design call' }]);
  expect(parseSkipped("GEO-3=needs the owner's call; ")).toEqual([{ issue: 'GEO-3', reason: "needs the owner's call" }]);
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
  reportLaneReady(db, parseReady(LANES, 'atc=0,flexible=0'), 'z-delivery', { total: 53, skipped: parseSkipped(SK) });
  expect(JSON.parse((db.query("SELECT value FROM meta WHERE key = 'lanes_ready_detail'").get() as { value: string }).value)).toMatchObject({ total: 53, skipped: [{ issue: 'GEO-1' }, { issue: 'GEO-2' }] });
  expect((db.query("SELECT data FROM events WHERE action = 'ready-by-lane'").get() as { data: string }).data).toContain('blocked by GEO-9');
  const s = readySummary(db, 30)!;
  expect(s.line).toBe('Ready: 53 total, 0 eligible across lanes, 2 skipped with reasons, 51 unexplained UNEXPLAINED');
  expect(skippedLines(s)).toEqual(['  GEO-1: blocked by GEO-9', '  GEO-2: needs a design call']);
  reportLaneReady(db, parseReady(LANES, 'atc=3,flexible=0'), 'z-delivery', { total: 5, skipped: parseSkipped(SK) });
  expect(readySummary(db, 30)!.line).toBe('Ready: 5 total, 3 eligible across lanes, 2 skipped with reasons, 0 unexplained');
  expect(dailyText(db, new Date(Date.parse(T0)))).toContain('Ready: 5 total, 3 eligible');
  atMin(31);
  expect(readySummary(db, 30)).toBeNull();
  // A later report without the detail clears it; a total alone shows too many skips as zero.
  atMin(32);
  reportLaneReady(db, parseReady(LANES, 'atc=1'), 'z-delivery');
  expect(readySummary(db, 30)).toBeNull();
  expect(skippedLines({ ...s, skipped: parseSkipped(Array.from({ length: 12 }, (_, i) => `GEO-${i + 1}=r`).join(';')) })).toHaveLength(11);
});

test('a working run whose sessions atc no longer lists holds no slot, after one sweep of grace; asleep still holds one', () => {
  const withSession = (issue: string, session: string) =>
    addRun(db, { issue, title: 'Invented kettle work', place: 'local', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  withSession('GEO-7', '0000000e-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  withSession('GEO-8', '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  recordAwake(db, [{ id: '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { vm: 'asleep' } }]);

  // GEO-7's session is new: atc may not list it yet
  expect(runningByLane(db)).toEqual({ flexible: 2 });
  atMin(6);
  recordAwake(db, [{ id: '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true, lifecycle: { vm: 'asleep' } }]);
  expect([parkedRuns(db), runningByLane(db)]).toEqual([[{ issue: 'GEO-7', lane: 'flexible' }], { flexible: 1 }]);

  // the reading is over 15 min old: a gone session frees nothing
  atMin(22);
  expect(runningByLane(db)).toEqual({ flexible: 2 });
});

test('a blocked run waiting on the owner whose session is idle 15 min holds no slot', () => {
  const id = '00000010-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-9', lane: 'flexible', next: 'Agent working.', place: 'local', session: id, title: 'Invented teapot work' });
  setState(db, 'GEO-9', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  atMin(15);
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  expect(runningByLane(db)).toEqual({ flexible: 0 });
});

test('a slot a gone session frees on imp stays held while impd is at its line', () => {
  const reading = { cap: cap(8192), impMib: 2048, error: null, lanes: LANES, slots: SLOTS };
  addRun(db, { issue: 'GEO-10', title: 'Invented kettle work', place: 'imp', session: '00000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  db.query('DELETE FROM capacity_samples').run();
  setCapacitySetting(db, 'nonnixMaxMib', null, 'z-delivery');
  atMin(6);
  createCapacitySample(db, { at: new Date(Date.parse(T0) + 6 * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 18_432 });
  recordAwake(db, []);
  expect([runningByLane(db), readSlotPlan(db, reading)?.pool]).toMatchObject([{ cloud: 0 }, { impRunning: 0, impFree: 0, held: 'impd at line' }]);
});

test('an awake session idle 15 min parks its blocked-on-the-owner run; a turn or a state change counts it again', () => {
  const id = '0000000d-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-4', lane: 'cloud', next: 'Agent working.', place: 'imp', session: id, title: 'Invented teapot work' });
  setState(db, 'GEO-4', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(db)).toEqual([]);
  atMin(10);
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(db)).toEqual([]);
  atMin(15);
  recordAwake(db, [{ alive: true, id, state: 'done' }]);
  expect(parkedRuns(db)).toEqual([{ issue: 'GEO-4', lane: 'cloud' }]);
  expect(runningByLane(db)).toEqual({ cloud: 0 });
  atMin(20);
  recordAwake(db, [{ alive: true, id, state: 'running' }]);
  expect(parkedRuns(db)).toEqual([]);
  atMin(25);
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(db)).toEqual([]);
  atMin(40);
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  expect(parkedRuns(db)).toEqual([{ issue: 'GEO-4', lane: 'cloud' }]);
  setState(db, 'GEO-4', 'working', {}, 'z-delivery');
  expect(parkedRuns(db)).toEqual([]);
});

test('an awake session with no atc state still holds its slot, as before', () => {
  const id = '0000000e-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-5', lane: 'atc', next: 'Agent working.', place: 'imp', session: id, title: 'Invented mug work' });
  setState(db, 'GEO-5', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(db, [{ alive: true, id }]);
  atMin(30);
  recordAwake(db, [{ alive: true, id }]);
  expect(parkedRuns(db)).toEqual([]);
});

test('a turn between two sweeps restarts the idle clock from atc\'s last activity', () => {
  const id = '0000000f-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  addRun(db, { actor: 'z-delivery', gate: null, geoffChat: false, issue: 'GEO-6', lane: 'imp', next: 'Agent working.', place: 'imp', session: id, title: 'Invented saucer work' });
  setState(db, 'GEO-6', 'blocked', { waitsOnGeoff: true }, 'z-delivery');
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }]);
  atMin(15);
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }], new Map([[id, Date.parse(T0) + 9 * 60_000]]));
  expect(parkedRuns(db)).toEqual([]);
  atMin(24);
  recordAwake(db, [{ alive: true, id, state: 'needs_you' }], new Map([[id, Date.parse(T0) + 9 * 60_000]]));
  expect(parkedRuns(db)).toEqual([{ issue: 'GEO-6', lane: 'imp' }]);
});

test('the stale alert names the last Linear read\'s error and gives the hand report as the fallback', () => {
  reportReady(db, 4, 'z-delivery');
  setMeta(db, 'lanes_ready_linear_error', 'Linear answered 401: invented failure');

  const alerted = checkReadyStale(db, new Date(Date.parse(T0) + 130 * 60_000), 3, 'hq-lanes');

  expect(alerted).toBe(true);

  expect(msgs()[0]?.text).toMatchInlineSnapshot(`"Lanes: 3 slot(s) free, and the newest Ready report is 2 h old (2026-10-16T01:00:00Z). The lanes can't tell how much work waits. hq's last read of Ready from Linear failed: Linear answered 401: invented failure. Until hq reads again, z-delivery reports Ready by hand with hq lanes ready --lane name=n,..."`);
});

test('the stale alert says hq has not read Ready from Linear when no read failed', () => {
  reportReady(db, 4, 'z-delivery');

  const alerted = checkReadyStale(db, new Date(Date.parse(T0) + 130 * 60_000), 3, 'hq-lanes');

  expect(alerted).toBe(true);

  expect(msgs()[0]?.text).toMatchInlineSnapshot(`"Lanes: 3 slot(s) free, and the newest Ready report is 2 h old (2026-10-16T01:00:00Z). The lanes can't tell how much work waits. hq has not read Ready from Linear since then. Until hq reads again, z-delivery reports Ready by hand with hq lanes ready --lane name=n,..."`);
});
