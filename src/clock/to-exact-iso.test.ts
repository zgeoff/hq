import { expect, test } from 'bun:test';
import { toExactISO } from './to-exact-iso.ts';

test('it writes a whole second as hq stores times', () => {
  expect(toExactISO(new Date('2026-11-02T09:00:00.000Z'))).toBe('2026-11-02T09:00:00Z');
});

test('it keeps the milliseconds of a time between seconds', () => {
  expect(toExactISO(new Date('2026-11-02T09:00:00.900Z'))).toBe('2026-11-02T09:00:00.900Z');
});
