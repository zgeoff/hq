import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from './config/override-env.ts';
import { isQuietHeld } from './is-quiet-held.ts';
import { sydneyUtc } from './morning/sydney-utc.ts';

test('it holds a weekly audit message and the unblock notice in the quiet hours, and nothing else', () => {
  onTestFinished(overrideEnv('HQ_QUIET', '03-07'));
  const awake = sydneyUtc(2026, 10, 20, 7, 0),
    quiet = sydneyUtc(2026, 10, 20, 3, 30);

  expect(isQuietHeld('job:weekly-audit:2026-10-19', quiet)).toBe(true);
  expect(isQuietHeld('job:weekly-audit:2026-10-19', awake)).toBe(false);
  expect(isQuietHeld('unblock-changed', quiet)).toBe(true);
  expect(isQuietHeld('unblock-changed', awake)).toBe(false);
  expect(isQuietHeld('job:morning-reports:2026-10-20', quiet)).toBe(false);
  expect(isQuietHeld(null, quiet)).toBe(false);
});
