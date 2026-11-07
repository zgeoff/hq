import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { capacitySettings } from './capacity-settings.ts';
import { CAPACITY_DEFAULTS } from './capacity-defaults.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads the defaults when nothing is stored', () => {
  const ctx = setupTest();

  expect(capacitySettings(ctx.db)).toStrictEqual(CAPACITY_DEFAULTS);
});

test('it overlays the stored settings on the defaults', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'capacity_settings', '{"holdSamples":3}');

  expect(capacitySettings(ctx.db)).toStrictEqual({ ...CAPACITY_DEFAULTS, holdSamples: 3 });
});

test('it throws a bad meta error when a stored setting is not a number', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'capacity_settings', '{"holdSamples":"three"}');

  expect(() => capacitySettings(ctx.db)).toThrow(/capacity_settings/u);
});
