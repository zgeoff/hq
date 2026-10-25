import { expect, test } from 'bun:test';
import { isSlotReadDue } from './is-slot-read-due.ts';

test.each([
  ['119 minutes old', '2026-10-14T00:01:00Z', false],
  ['exactly 2 hours old', '2026-10-14T00:00:00Z', true],
  ['3 hours old', '2026-10-13T23:00:00Z', true],
])('it reads the slots when the newest read is %s', (_label, newestAt, due) => {
  expect(isSlotReadDue(newestAt, new Date('2026-10-14T02:00:00Z'))).toBe(due);
});

test('it reads the slots when there is no read yet', () => {
  expect(isSlotReadDue(null, new Date('2026-10-14T02:00:00Z'))).toBe(true);
});
