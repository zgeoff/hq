import { expect, test } from 'bun:test';
import { parseBtime } from './parse-btime.ts';

test('it reads the boot time in seconds from the btime line', () => {
  expect(parseBtime('cpu  41 0 17 900\nintr 5120\nbtime 1793350000\nprocesses 812\n')).toBe(1_793_350_000);
});

test('it returns null for stat text with no btime line', () => {
  expect(parseBtime('cpu  41 0 17 900\nintr 5120\nprocesses 812\n')).toBeNull();
});

test('it returns null for a btime line with no number', () => {
  expect(parseBtime('cpu  41 0 17 900\nintr 5120\nbtime \nprocesses 812\n')).toBeNull();
});
