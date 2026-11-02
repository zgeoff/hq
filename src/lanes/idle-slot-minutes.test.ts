import { expect, onTestFinished, test } from 'bun:test';
import { setCapacitySetting } from '../capacity/set-capacity-setting.ts';
import { createCapacitySample } from '../../test/create-capacity-sample.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { idleSlotMinutes } from './idle-slot-minutes.ts';
import { tick } from './tick.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it counts the idle gap between two samples as 30 minutes at most', () => {
  const ctx = setupTest();
  const sample = {
    cap: {
      imp: { freeMib: 16_384, room: true },
      providers: { claude: { room: true, unattended: true, target: 'imp' as const }, codex: { room: true, unattended: false, target: 'local' as const } },
    },
    impMib: 2048,
    error: null,
  };
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '65536', 'z-delivery');
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '1000', 'z-delivery');
  createCapacitySample(ctx.db, { at: '2026-10-20T00:58:00Z', nonnixAwakeMib: 0 });
  createCapacitySample(ctx.db, { at: '2026-10-20T01:58:00Z', nonnixAwakeMib: 0 });
  at('2026-10-20T01:00:00.000Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-20T02:00:00.000Z');
  tick(ctx.db, sample, 'hq-lanes');

  expect(idleSlotMinutes(ctx.db, 24).slotMinutes).toBe(8 * 30);
});
