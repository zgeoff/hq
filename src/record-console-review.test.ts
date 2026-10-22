import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createUnblockItems } from '../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { recordConsoleMark } from './record-console-mark.ts';
import { recordConsoleReview } from './record-console-review.ts';
import { roleName } from './roles/role-name.ts';
import { getUnblock } from './unblock/get-unblock.ts';

function setupTest(): Database {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

function readOwnerMessages(db: Database): string[] {
  return (db.query('SELECT text FROM outbox WHERE target = ? ORDER BY id').all(roleName('owner')) as { text: string }[]).map((m) => m.text);
}

test('each review answer lands as its own console answer, and closes, drops or puts off the item', () => {
  const db = createUnblockItems(setupTest(), {
    'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] },
    'review-5': { task: 'Review kettle#5 and say lgtm', links: [{ label: 'kettle#5', url: 'https://github.com/kettle-co/kettle/pull/5', subject: true }] },
    'review-6': { task: 'Review kettle#6 and say lgtm', links: [{ label: 'kettle#6', url: 'https://github.com/kettle-co/kettle/pull/6', subject: true }] },
    'review-7': { task: 'Review kettle#7 and say lgtm', links: [{ label: 'kettle#7', url: 'https://github.com/kettle-co/kettle/pull/7', subject: true }] },
  });
  recordConsoleReview(db, { id: 'review-4', review: 'lgtm', note: '', actor: 'console' });
  recordConsoleReview(db, { id: 'review-5', review: 'changes', note: 'Descale it first.', actor: 'console' });
  recordConsoleReview(db, { id: 'review-6', review: 'later', note: '', actor: 'console' });
  recordConsoleReview(db, { id: 'review-7', review: 'reject', note: 'The spout is wrong.', actor: 'console' });

  expect(readOwnerMessages(db)).toStrictEqual([
    'console answer: review review-4: lgtm',
    'console answer: review review-5: Changes | Descale it first.',
    'console answer: review review-6: Later',
    'console answer: review review-7: Reject | The spout is wrong.',
  ]);
  expect(['review-4', 'review-5', 'review-6', 'review-7'].map((id) => [getUnblock(db, id)?.state, getUnblock(db, id)?.note])).toStrictEqual([
    ['done', 'lgtm'],
    ['done', 'Changes | Descale it first.'],
    ['open', null],
    ['dropped', 'Reject | The spout is wrong.'],
  ]);
  expect(getUnblock(db, 'review-6')?.due_at).not.toBeNull();
});

test('Changes needs a note, a to-do takes no review answer, and a review takes no to-do mark', () => {
  const db = createUnblockItems(setupTest(), {
    'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] },
    lid: { task: 'Fit the new lid on the kettle' },
  });

  expect(() => recordConsoleReview(db, { id: 'review-4', review: 'changes', note: '  ', actor: 'console' })).toThrow('Changes needs a note');
  expect(() => recordConsoleReview(db, { id: 'lid', review: 'lgtm', note: '', actor: 'console' })).toThrow('lid is a to-do, not a review');
  expect(() => recordConsoleMark(db, { id: 'review-4', mark: 'done', note: '', actor: 'console' })).toThrow('review-4 is a review');
  expect([getUnblock(db, 'review-4')?.state, getUnblock(db, 'lid')?.state, readOwnerMessages(db)]).toStrictEqual(['open', 'open', []]);
});
