import { expect, onTestFinished, test } from 'bun:test';
import { iso } from '../clock/iso.ts';
import { freshDb } from '../../test/helpers.ts';
import { downtime } from './downtime.ts';
import { buildProbeSeeder } from './test-utils/build-probe-seeder.ts';

const MINUTE_MS = 60_000;
const WEEK_START = Date.parse('2026-10-12T00:00:00Z');
const WEEK_END = WEEK_START + 7 * 24 * 60 * MINUTE_MS;

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return { db: fresh.db, seed: buildProbeSeeder(fresh), readWeek: () => downtime(fresh.db, new Date(WEEK_START), new Date(WEEK_END)) };
}

test('a week the probe joins mid-window reports blind minutes only for gaps after its first sample', () => {
  const ctx = setupTest();
  const probeStart = WEEK_START + 4 * 24 * 60 * MINUTE_MS;
  for (let minute = 0; minute < 3 * 24 * 60; minute += 1) {
    if (minute < 60 || minute >= 70) {
      ctx.seed.probeSample({ at: iso(new Date(probeStart + minute * MINUTE_MS)) });
    }
  }

  const week = ctx.readWeek();

  expect(week.blindMinutes).toBeWithin(8, 11);
  expect(week.probeStart).toBe(iso(new Date(probeStart)));
});

test('a full week of one-minute samples reports about no blind minutes and no probe start', () => {
  const ctx = setupTest();
  for (let minute = 0; minute < 7 * 24 * 60; minute += 1) {
    ctx.seed.probeSample({ at: iso(new Date(WEEK_START + minute * MINUTE_MS)) });
  }

  const week = ctx.readWeek();

  expect(week.blindMinutes).toBeWithin(0, 3);
  expect(week.probeStart).toBeNull();
});

test('a probe that started before the window gives no probe start', () => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: iso(new Date(WEEK_START - 3 * 24 * 60 * MINUTE_MS)) });

  expect(ctx.readWeek().probeStart).toBeNull();
});

test('a window with no samples at all counts every minute as blind', () => {
  const ctx = setupTest();

  expect(ctx.readWeek()).toMatchObject({ blindMinutes: 7 * 24 * 60, probeStart: null });
});
