import { expect, onTestFinished, test } from 'bun:test';
import { iso } from '../clock/iso.ts';
import { freshDb } from '../../test/helpers.ts';
import { downtime } from './downtime.ts';
import { buildProbeSeeder } from './test-utils/build-probe-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const minuteMs = 60_000;
  const weekStart = Date.parse('2026-10-12T00:00:00Z');
  const weekEnd = weekStart + 7 * 24 * 60 * minuteMs;

  return {
    seed: buildProbeSeeder(fresh),
    minuteMs,
    weekStart,
    readWeek: () => downtime(fresh.db, new Date(weekStart), new Date(weekEnd)),
  };
}

test('it reports blind minutes only for gaps after its first sample', () => {
  const ctx = setupTest();
  const probeStart = ctx.weekStart + 4 * 24 * 60 * ctx.minuteMs;
  for (let minute = 0; minute < 3 * 24 * 60; minute += 1) {
    if (minute < 60 || minute >= 70) {
      ctx.seed.probeSample({ at: iso(new Date(probeStart + minute * ctx.minuteMs)) });
    }
  }

  const week = ctx.readWeek();

  expect(week.blindMinutes).toBeWithin(8, 11);
  expect(week.probeStart).toBe(iso(new Date(probeStart)));
});

test('it reports, for a full week of one-minute samples, about no blind minutes and no probe start', () => {
  const ctx = setupTest();
  for (let minute = 0; minute < 7 * 24 * 60; minute += 1) {
    ctx.seed.probeSample({ at: iso(new Date(ctx.weekStart + minute * ctx.minuteMs)) });
  }

  const week = ctx.readWeek();

  expect(week.blindMinutes).toBeWithin(0, 3);
  expect(week.probeStart).toBeNull();
});

test('it gives, for a probe that started before the window, no probe start', () => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: iso(new Date(ctx.weekStart - 3 * 24 * 60 * ctx.minuteMs)) });

  expect(ctx.readWeek().probeStart).toBeNull();
});

test('it counts every minute as blind for a window with no samples at all', () => {
  const ctx = setupTest();

  expect(ctx.readWeek()).toMatchObject({ blindMinutes: 7 * 24 * 60, probeStart: null });
});
