import { expect, test } from 'bun:test';
import { parseCapUntil } from './parse-cap-until.ts';

test('it keeps an ISO time after now', () => {
  expect(parseCapUntil('2026-10-20T09:00:00Z', new Date('2026-10-15T00:00:00Z'))).toBe('2026-10-20T09:00:00Z');
});

test('it refuses an ISO time that has passed', () => {
  expect(() => parseCapUntil('2026-10-14T09:00:00Z', new Date('2026-10-15T00:00:00Z'))).toThrow('has passed');
});

test('it refuses a time it cannot read', () => {
  expect(() => parseCapUntil('after the kettle boils', new Date('2026-10-15T00:00:00Z'))).toThrow('--until takes an ISO time');
});

test('it refuses a Sydney time of day that does not exist', () => {
  expect(() => parseCapUntil('Mon 25:00', new Date('2026-10-15T00:00:00Z'))).toThrow('not a time of day');
});

test('it reads a Sydney wall time as the next such moment', () => {
  expect(parseCapUntil('Mon 08:00', new Date('2026-10-15T00:00:00Z'))).toBe('2026-10-18T21:00:00Z');
});

test('it reads a Sydney wall time at the moment itself as the same time next week', () => {
  expect(parseCapUntil('Mon 08:00', new Date('2026-10-18T21:00:00Z'))).toBe('2026-10-25T21:00:00Z');
});

test('it reads a Sydney wall time across the start of daylight saving', () => {
  expect(parseCapUntil('Mon 08:00', new Date('2026-10-03T00:00:00Z'))).toBe('2026-10-04T21:00:00Z');
});

test('it reads a Sydney wall time across the end of daylight saving', () => {
  expect(parseCapUntil('Mon 08:00', new Date('2027-04-02T00:00:00Z'))).toBe('2027-04-04T22:00:00Z');
});

test('it skips a Sydney wall time the spring clock change removes', () => {
  expect(parseCapUntil('Sun 02:30', new Date('2026-10-03T00:00:00Z'))).toBe('2026-10-10T15:30:00Z');
});

test('it takes the first of a Sydney wall time the autumn clock change repeats', () => {
  expect(parseCapUntil('Sun 02:30', new Date('2027-04-02T00:00:00Z'))).toBe('2027-04-03T15:30:00Z');
});
