import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { freshDb } from '../../test/helpers.ts';
import { getUnblock } from './get-unblock.ts';
import { isRecheck } from './is-recheck.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test.each([
  ['3 days and an hour old', 3 * 86_400_000 + 3_600_000, true],
  ['2 days old', 2 * 86_400_000, false],
])('it says an item with no condition, %s, needs a recheck: %s', (_label, ageMs, expected) => {
  const db = createUnblockItems(setupTest(), { plain: { task: 'Run the steam test' } });
  const item = getUnblock(db, 'plain');
  if (item === null) {
    throw new Error('the seeded item is missing');
  }
  const later = new Date(Date.parse(item.added_at) + ageMs);

  expect(isRecheck(item, later)).toBe(expected);
});

test('it never says an item with a condition needs a recheck', () => {
  const db = createUnblockItems(setupTest(), { waiting: { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  const item = getUnblock(db, 'waiting');
  if (item === null) {
    throw new Error('the seeded item is missing');
  }
  const later = new Date(Date.parse(item.added_at) + 30 * 86_400_000);

  expect(isRecheck(item, later)).toBe(false);
});

test('it never says an item with a subject PR needs a recheck', () => {
  const links = [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true as const }];
  const db = createUnblockItems(setupTest(), { review: { task: 'Review kettle#4', links } });
  const item = getUnblock(db, 'review');
  if (item === null) {
    throw new Error('the seeded item is missing');
  }
  const later = new Date(Date.parse(item.added_at) + 30 * 86_400_000);

  expect(isRecheck(item, later)).toBe(false);
});
