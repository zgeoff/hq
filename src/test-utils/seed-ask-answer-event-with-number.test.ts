import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { seedAskAnswerEventWithNumber } from './seed-ask-answer-event-with-number.ts';
import { seedEvent } from './seed-event.ts';

test('#seedAskAnswerEventWithNumber makes the answer of an answered-ask event a number', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  seedEvent(fresh, { subject: 'ask', action: 'answered', data: { answer: 'Wood' } });

  seedAskAnswerEventWithNumber(fresh);

  expect(fresh.db.query('SELECT data FROM events').all()).toStrictEqual([{ data: '{"answer":42}' }]);
});
