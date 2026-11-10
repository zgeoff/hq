import { expect, test } from 'bun:test';
import { pickBlindWindow } from './pick-blind-window.ts';

test.each([
  { name: 'no samples at all', firstHour: null, coveredHours: 0, blindHours: 10, probeStart: null },
  { name: 'a first sample before the window', firstHour: -1, coveredHours: 8, blindHours: 2, probeStart: null },
  { name: 'a first sample at the window start', firstHour: 0, coveredHours: 10, blindHours: 0, probeStart: null },
  { name: 'a first sample inside the window', firstHour: 4, coveredHours: 5, blindHours: 1, probeStart: '2026-10-12T04:00:00Z' },
  { name: 'a first sample after the window end', firstHour: 11, coveredHours: 0, blindHours: 0, probeStart: null },
])('it picks the blind time and probe start for $name', (row) => {
  const hourMs = 3_600_000;
  const fromMs = Date.parse('2026-10-12T00:00:00Z');
  const picked = pickBlindWindow({
    fromMs,
    toMs: fromMs + 10 * hourMs,
    firstSampleMs: row.firstHour === null ? null : fromMs + row.firstHour * hourMs,
    coveredMs: row.coveredHours * hourMs,
  });

  expect(picked).toStrictEqual({ blindMs: row.blindHours * hourMs, probeStart: row.probeStart });
});
