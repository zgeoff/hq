import { expect, test } from 'bun:test';
import { pickBlindWindow } from './pick-blind-window.ts';

const HOUR_MS = 3_600_000;
const FROM_MS = Date.parse('2026-10-12T00:00:00Z');
const TO_MS = FROM_MS + 10 * HOUR_MS;

test.each([
  { name: 'no samples at all', firstSampleMs: null, coveredMs: 0, expected: { blindMs: 10 * HOUR_MS, probeStart: null } },
  { name: 'a first sample before the window', firstSampleMs: FROM_MS - HOUR_MS, coveredMs: 8 * HOUR_MS, expected: { blindMs: 2 * HOUR_MS, probeStart: null } },
  { name: 'a first sample at the window start', firstSampleMs: FROM_MS, coveredMs: 10 * HOUR_MS, expected: { blindMs: 0, probeStart: null } },
  { name: 'a first sample inside the window', firstSampleMs: FROM_MS + 4 * HOUR_MS, coveredMs: 5 * HOUR_MS, expected: { blindMs: HOUR_MS, probeStart: '2026-10-12T04:00:00Z' } },
  { name: 'a first sample after the window end', firstSampleMs: TO_MS + HOUR_MS, coveredMs: 0, expected: { blindMs: 0, probeStart: null } },
])('it picks the blind time and probe start for $name', ({ firstSampleMs, coveredMs, expected }) => {
  expect(pickBlindWindow({ fromMs: FROM_MS, toMs: TO_MS, firstSampleMs, coveredMs })).toStrictEqual(expected);
});
