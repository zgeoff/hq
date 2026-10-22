import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { answerAsk } from '../asks/answer-ask.ts';
import { addAsk } from '../asks/add-ask.ts';
import { openAsk } from '../asks/open-ask.ts';
import { recordConsoleReview } from '../record-console-review.ts';
import { addTyped } from '../typed/add-typed.ts';
import { countAnswerWeeks } from './count-answer-weeks.ts';
import { mergeAnswerWeeks } from './merge-answer-weeks.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

function createAnsweredCall(db: Database, id: string, answer: string): void {
  addAsk(db, { kind: 'call', id, title: `Call ${id}`, question: 'Descale it?', body: 'Descale it?', issues: [], forSession: null, actor: 'kettle-bot' });
  openAsk(db, { id, force: true, actor: 'kettle-bot' });
  answerAsk(db, { id, kind: 'call', answer, actor: 'teapot-bot' });
}

test('each Sydney week counts its call answers and console reviews, not typed lines, newest first', () => {
  const db = setupTest();

  // Wednesday the week before, then Wednesday 14 Oct.
  at('2026-10-07T01:00:00Z');
  createAnsweredCall(db, 'kettle-1', 'yes');
  at(NOON_SYDNEY);
  createAnsweredCall(db, 'kettle-2', 'no');
  createUnblockItems(db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  recordConsoleReview(db, { id: 'review-4', review: 'lgtm', note: '', actor: 'console' });
  addTyped(db, { to: 'kettle-bot', toId: null, toName: null, text: 'no', source: { kind: 'call', ref: 'kettle-2', at: null }, actor: 'teapot-bot' });

  expect(countAnswerWeeks(db, 3, new Date('2026-10-14T02:00:00Z'))).toStrictEqual([
    { from: '2026-10-11T13:00:00Z', to: '2026-10-14T02:00:00Z', partial: true, answered: 2 },
    { from: '2026-10-04T13:00:00Z', to: '2026-10-11T13:00:00Z', partial: false, answered: 1 },
    { from: '2026-09-27T14:00:00Z', to: '2026-10-04T13:00:00Z', partial: false, answered: 0 },
  ]);
});

test('hq stats gets the weekly counts in its data, and as a section right after Wait on the owner', () => {
  const answerWeeks = [
      { from: '2026-10-11T13:00:00Z', to: '2026-10-14T02:00:00Z', partial: true, answered: 2 },
      { from: '2026-10-04T13:00:00Z', to: '2026-10-11T13:00:00Z', partial: false, answered: 1 },
    ],
    merged = mergeAnswerWeeks({ data: { stats: 'kettle' }, text: 'hq stats header\n\nWait on the owner\n  calls\n\nMerged to live' }, answerWeeks);
  expect(merged.data).toStrictEqual({ stats: 'kettle', answerWeeks });
  expect(merged.text).toBe("hq stats header\n\nWait on the owner\n  calls\n\nYes/no's the owner answered (calls, proposals, reviews; a standing grant shows as a drop; hq answers lists them)\n  week of 2026-10-12: 2 (so far)\n  week of 2026-10-05: 1\n\nMerged to live");
});
