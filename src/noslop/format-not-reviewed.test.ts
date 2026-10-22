import { expect, test } from 'bun:test';
import { formatNotReviewed } from './format-not-reviewed.ts';

test('each file no noslop call read is listed with its reason, under a line that asks for a hand check', () => {
  expect(formatNotReviewed([{ path: 'data/kettle-readings.json', reason: 'data' }, { path: 'src/teapot-lid.ts', reason: 'too-large' }])).toStrictEqual([
    '== not reviewed by noslop: 2 file(s), check them by hand',
    '  - data/kettle-readings.json (data)',
    '  - src/teapot-lid.ts (too-large)',
  ]);
});

test('a review that read every file adds no lines', () => {
  expect(formatNotReviewed([])).toStrictEqual([]);
});
