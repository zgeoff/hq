import { expect, onTestFinished, test } from 'bun:test';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from './enqueue.ts';
import { flush } from './flush.ts';
import { readOutboxRows } from './read-outbox-rows.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOTIFY', undefined));
  const atc = fakeAtc(fresh.dir);
  onTestFinished(() => atc.stop());
  return { db: fresh.db };
}

test('it reads every outbox row, sent ones included, oldest first', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  const firstSeq = logEvent(ctx.db, 'hq', 'kettle-1', 'boiled', 'kettle-bot', null, null);
  enqueue(ctx.db, firstSeq, 'z-stu', 'The kettle boiled.');
  await flush(ctx.db);
  const secondSeq = logEvent(ctx.db, 'hq', 'kettle-2', 'boiled', 'kettle-bot', null, null);
  enqueue(ctx.db, secondSeq, 'z-stu', 'The second kettle boiled.', 'kettle');

  expect(readOutboxRows(ctx.db)).toStrictEqual([
    {
      id: 1,
      event_seq: firstSeq,
      target: 'z-stu',
      text: 'The kettle boiled.',
      idem_key: `hq-ev${firstSeq}-z-stu`,
      status: 'sent',
      attempts: 1,
      last_error: null,
      message_id: 'm-1',
      created_at: '2026-10-22T12:00:00Z',
      sent_at: '2026-10-22T12:00:00Z',
      topic: null,
    },
    {
      id: 2,
      event_seq: secondSeq,
      target: 'z-stu',
      text: 'The second kettle boiled.',
      idem_key: `hq-ev${secondSeq}-z-stu`,
      status: 'pending',
      attempts: 0,
      last_error: null,
      message_id: null,
      created_at: '2026-10-22T12:00:00Z',
      sent_at: null,
      topic: 'kettle',
    },
  ]);
});

test('it reads no rows from an empty outbox', () => {
  const ctx = setupTest();

  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});
