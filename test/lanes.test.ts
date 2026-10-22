import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { checkReadyStale } from '../src/lanes/check-ready-stale.ts';
import { getLanesHold } from '../src/lanes/get-lanes-hold.ts';
import { holdLanes } from '../src/lanes/hold-lanes.ts';
import { idleSlotMinutes } from '../src/lanes/idle-slot-minutes.ts';
import { nudgeLog } from '../src/lanes/nudge-log.ts';
import { readCapacity } from '../src/lanes/read-capacity.ts';
import { releaseLanes } from '../src/lanes/release-lanes.ts';
import { reportReady } from '../src/lanes/report-ready.ts';
import { slotsFrom } from '../src/lanes/slots-from.ts';
import { tick } from '../src/lanes/tick.ts';
import type { Capacity } from '../src/lanes/types.ts';
import { setCapacitySetting } from '../src/capacity/set-capacity-setting.ts';
import { createCapacitySample } from './create-capacity-sample.ts';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at, freshDb } from './helpers.ts';
import { setForward } from '../src/outbox/set-forward.ts';
import { orchestratorName } from '../src/wake/orchestrator-name.ts';

let db: Database;
let cleanup: () => void;

const cap = (freeMib: number, claudeRoom = true): Capacity => ({
  imp: { freeMib, room: freeMib >= 2048 },
  providers: { claude: { room: claudeRoom, unattended: true, target: 'imp' }, codex: { room: true, unattended: false, target: 'local' } },
});
const sample = (freeMib: number, claudeRoom = true) => ({ cap: cap(freeMib, claudeRoom), impMib: 2048, error: null });
const msgs = () => db.query('SELECT target, text FROM outbox').all() as { target: string; text: string }[];
const atMin = (m: number) => at(new Date(new Date(NOON_SYDNEY).getTime() + m * 60_000).toISOString());

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);

  // An impd reading every 5 min under raised lines, so the budget, not the line, sets the slots.
  setCapacitySetting(db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  for (let m = -5; m <= 105; m += 5) {
    createCapacitySample(db, { at: new Date(Date.parse(NOON_SYDNEY) + m * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  }
});
afterEach(() => cleanup());

test('slots: whole imps of free room, only when an unattended imp provider has quota', () => {
  expect(slotsFrom(cap(16384), 2048).slots).toBe(8);
  expect(slotsFrom(cap(3000), 2048).slots).toBe(1);
  expect(slotsFrom(cap(16384, false), 2048).slots).toBe(0);
  expect(slotsFrom({ imp: { error: 'imp info failed' } }, 2048)).toEqual({ freeMib: null, slots: 0 });
});

test('nudges once slots stay free past 10 minutes, then not again while nothing changes', () => {
  expect(tick(db, sample(16384), 'hq-lanes').why).toContain('under 10');
  atMin(5);
  expect(tick(db, sample(16384), 'hq-lanes').nudged).toBe(false);
  atMin(10);
  const r = tick(db, sample(16384), 'hq-lanes');
  expect(r.nudged).toBe(true);
  expect(msgs()).toEqual([{ target: 'z-delivery', text: expect.stringContaining('8 agent slots free for 10 min, Ready count unknown') }]);
  atMin(15);
  expect(tick(db, sample(16384), 'hq-lanes').why).toContain('nothing changed');
  atMin(40);
  expect(tick(db, sample(16384), 'hq-lanes').nudged).toBe(true); // 30 min passed
  expect(nudgeLog(db, 5)).toHaveLength(2);
});

test('a change of state nudges again before 30 minutes', () => {
  tick(db, sample(16384), 'hq-lanes');
  atMin(10);
  tick(db, sample(16384), 'hq-lanes');
  atMin(15);
  expect(tick(db, sample(8192), 'hq-lanes').nudged).toBe(true);
});

test('full lanes reset the clock; a reported count informs but never suppresses', () => {
  tick(db, sample(16384), 'hq-lanes');
  atMin(8);
  tick(db, sample(0), 'hq-lanes');
  atMin(12);
  expect(tick(db, sample(4096), 'hq-lanes').why).toContain('free for 0 min');
  reportReady(db, 0, 'z-delivery');
  atMin(30);
  const r = tick(db, sample(4096), 'hq-lanes');
  expect(r.nudged).toBe(true); // a reported 0 never suppresses a nudge
  expect(msgs()[0]!.text).toContain('0 eligible Ready issues');
  reportReady(db, 6, 'z-delivery');
  atMin(31);
  expect(tick(db, sample(4096), 'hq-lanes').nudged).toBe(true); // count changed
  expect(msgs()[0]!.text).toContain('6 eligible Ready issues');
  atMin(62);
  expect(tick(db, sample(4096), 'hq-lanes').eligible).toBeNull(); // stale after 30 min
});

test('a failed reading neither nudges nor resets the clock', () => {
  tick(db, sample(16384), 'hq-lanes');
  atMin(11);
  expect(tick(db, { cap: null, impMib: 2048, error: 'capacity.sh exit 1' }, 'hq-lanes').nudged).toBe(false);
  atMin(12);
  expect(tick(db, sample(16384), 'hq-lanes').freeMinutes).toBe(12);
});

test('the log shows whether free slots dropped after a nudge, and the idle gap', () => {
  tick(db, sample(16384), 'hq-lanes');
  atMin(10);
  tick(db, sample(16384), 'hq-lanes');
  atMin(15);
  tick(db, sample(4096), 'hq-lanes'); // follow-up not due yet (10 min)
  expect(nudgeLog(db, 5)[0]!.slots_after).toBeNull();
  atMin(21);
  tick(db, sample(2048), 'hq-lanes');
  expect(nudgeLog(db, 5).at(-1)).toMatchObject({ slots: 8, slots_after: 1 });
  expect(idleSlotMinutes(db, 24).slotMinutes).toBe(8 * 10 + 8 * 5 + 2 * 6);
});

test('unsent nudges never pile up: only the newest stays in the outbox', () => {
  tick(db, sample(16384), 'hq-lanes');
  for (const m of [10, 40, 70, 100]) {
    atMin(m);
    expect(tick(db, sample(16384), 'hq-lanes').nudged).toBe(true);
  }
  const rows = msgs();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.text).toContain('free for 100 min');
});

test('readCapacity treats an imp error inside good JSON as no reading', async () => {
  const run = async () => ({ code: 0, stdout: JSON.stringify({ imp: { error: 'imp info failed', room: false } }), stderr: '' });
  const r = await readCapacity(run);
  expect(r.cap).toBeNull();
  expect(r.error).toContain('imp info failed');
});

test('a backlog of unsent nudges is cut to the newest, and to none once lanes are full', () => {
  tick(db, sample(16384), 'hq-lanes');
  atMin(10);
  tick(db, sample(16384), 'hq-lanes');
  atMin(41);
  tick(db, sample(16384), 'hq-lanes'); // 30 min on: a second nudge supersedes the unsent first
  expect(msgs()).toHaveLength(1);
  atMin(13);
  tick(db, sample(0), 'hq-lanes');
  expect(msgs()).toHaveLength(0);
});

test('a hold pauses nudges, drops an unsent one, and ends by itself', () => {
  tick(db, sample(16384), 'hq-lanes');
  atMin(10);
  expect(tick(db, sample(16384), 'hq-lanes').nudged).toBe(true);
  expect(msgs()).toHaveLength(1); // unsent
  holdLanes(db, 60, 'host switch', 'z-delivery');
  expect(msgs()).toHaveLength(0);
  atMin(45);
  expect(tick(db, sample(16384), 'hq-lanes').why).toContain('held until');
  expect(nudgeLog(db, 5)).toHaveLength(1);
  atMin(71);
  expect(getLanesHold(db)).toBeNull();
  expect(tick(db, sample(16384), 'hq-lanes').nudged).toBe(true); // the free time kept counting
});

test('it drops an unsent nudge at the forwarded orchestrator when the lanes are held', () => {
  setForward(db, orchestratorName(), 'z-other');
  tick(db, sample(16_384), 'hq-lanes');
  atMin(10);
  tick(db, sample(16_384), 'hq-lanes');

  holdLanes(db, 60, 'host switch', 'z-delivery');

  expect(msgs()).toStrictEqual([]);
});

test('it drops an unsent nudge at the forwarded orchestrator once the lanes are full', () => {
  setForward(db, orchestratorName(), 'z-other');
  tick(db, sample(16_384), 'hq-lanes');
  atMin(10);
  tick(db, sample(16_384), 'hq-lanes');
  atMin(15);

  tick(db, sample(0), 'hq-lanes');

  expect(msgs()).toStrictEqual([]);
});

test('release ends a hold early; bad holds are refused', () => {
  expect(() => holdLanes(db, 0, 'x', 'z-delivery')).toThrow('--minutes');
  expect(() => holdLanes(db, 24 * 60 + 1, 'x', 'z-delivery')).toThrow('--minutes');
  expect(() => holdLanes(db, 30, '  ', 'z-delivery')).toThrow('--reason');
  holdLanes(db, 30, 'restart', 'z-delivery');
  expect(releaseLanes(db, 'z-delivery')).toBe(true);
  expect(releaseLanes(db, 'z-delivery')).toBe(false);
});

test('a Ready report over 2 h old with a free slot alerts z-stu once per stale spell; a new report starts a new spell', () => {
  atMin(-180);
  reportReady(db, 4, 'z-delivery');
  atMin(0);
  tick(db, sample(16_384), 'hq-lanes');
  expect(msgs().filter((m) => m.target === 'z-stu')).toEqual([{ target: 'z-stu', text: expect.stringContaining('8 slot(s) free, and the newest Ready report is 3 h old') }]);
  atMin(5);
  tick(db, sample(16_384), 'hq-lanes');
  expect(msgs().filter((m) => m.target === 'z-stu')).toHaveLength(1);
  reportReady(db, 2, 'z-delivery');
  atMin(100);
  tick(db, sample(16_384), 'hq-lanes');
  expect(msgs().filter((m) => m.target === 'z-stu')).toHaveLength(1);

  // The impd readings end at 105 min; one more keeps the imp slots free at 126.
  createCapacitySample(db, { at: new Date(Date.parse(NOON_SYDNEY) + 125 * 60_000).toISOString().replace('.000Z', 'Z'), nonnixAwakeMib: 0 });
  atMin(126);
  tick(db, sample(16_384), 'hq-lanes');
  expect(msgs().filter((m) => m.target === 'z-stu')).toHaveLength(2);
});

test('a fresh Ready report, full lanes, a failed reading or no report at all sends no stale alert', () => {
  tick(db, sample(16_384), 'hq-lanes');
  atMin(-180);
  reportReady(db, 4, 'z-delivery');
  atMin(0);
  tick(db, sample(0), 'hq-lanes');
  tick(db, { cap: null, impMib: 2048, error: 'capacity.sh exit 1' }, 'hq-lanes');
  reportReady(db, 4, 'z-delivery');
  atMin(60);
  tick(db, sample(16_384), 'hq-lanes');
  expect(msgs().filter((m) => m.target === 'z-stu')).toEqual([]);
});

test('the stale alert is due once the report is past 2 h, not at the next whole minute', () => {
  reportReady(db, 4, 'z-delivery');
  const atTwoHours = new Date(Date.parse(NOON_SYDNEY) + 120 * 60_000),
    justOver = new Date(Date.parse(NOON_SYDNEY) + 120 * 60_000 + 30_000);
  expect(checkReadyStale(db, atTwoHours, 3, 'hq-lanes')).toBe(false);
  expect(checkReadyStale(db, justOver, 3, 'hq-lanes')).toBe(true);
});

test('quiet hours hold the stale alert until the first look after them', () => {
  at(new Date(Date.parse(FOUR_AM_SYDNEY) - 180 * 60_000).toISOString());
  reportReady(db, 4, 'z-delivery');
  at(FOUR_AM_SYDNEY);
  expect(checkReadyStale(db, new Date(FOUR_AM_SYDNEY), 3, 'hq-lanes')).toBe(false);

  // Noon the next day in Sydney: quiet hours are over.
  const noon = new Date(Date.parse(FOUR_AM_SYDNEY) + 8 * 60 * 60_000);
  expect(checkReadyStale(db, noon, 3, 'hq-lanes')).toBe(true);
  expect(msgs()).toEqual([{ target: 'z-stu', text: expect.stringContaining('3 slot(s) free') }]);
});
