import { expect, onTestFinished, test } from 'bun:test';
import { makeAnswerQueue, updateEnv } from '@zgeoff/testing/helpers';
import invariant from 'tiny-invariant';
import { freshDb } from '../../test/helpers.ts';
import { readEvents } from '../read-events.ts';
import { probeOnce } from './probe-once.ts';
import { readOutageRows } from './read-outage-rows.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads every outage row, oldest first', async () => {
  const ctx = setupTest();
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- ms is the Fetcher result's own field
  const up = { ok: true, status: 200, ms: 12 };
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- ms is the Fetcher result's own field
  const failing = { ok: false, status: 503, ms: 12, error: 'HTTP 503' };
  const fetcher = makeAnswerQueue([
    Promise.resolve(failing),
    Promise.resolve(up),
    Promise.resolve(failing),
    Promise.resolve(up),
    Promise.resolve(up),
    Promise.resolve(up),
    Promise.resolve(up),
    Promise.resolve(failing),
    Promise.resolve(up),
    Promise.resolve(failing),
  ]);
  updateEnv('HQ_NOW', '2026-10-22T01:00:00Z');
  await probeOnce(ctx.db, fetcher, 'hq-probe');
  updateEnv('HQ_NOW', '2026-10-22T01:01:00Z');
  await probeOnce(ctx.db, fetcher, 'hq-probe');
  updateEnv('HQ_NOW', '2026-10-22T01:30:00Z');
  await probeOnce(ctx.db, fetcher, 'hq-probe');
  updateEnv('HQ_NOW', '2026-10-22T02:00:00Z');
  await probeOnce(ctx.db, fetcher, 'hq-probe');
  updateEnv('HQ_NOW', '2026-10-22T02:03:00Z');
  await probeOnce(ctx.db, fetcher, 'hq-probe');
  const [outage] = readEvents(ctx.db, 'hq', 'probe', ['outage']);
  const [recovered] = readEvents(ctx.db, 'hq', 'probe', ['recovered']);
  const [unready] = readEvents(ctx.db, 'hq', 'probe', ['unready']);
  invariant(outage && recovered && unready);

  expect(readOutageRows(ctx.db)).toStrictEqual([
    { id: 1, started_at: '2026-10-22T01:00:00Z', detected_at: '2026-10-22T01:01:00Z', ended_at: '2026-10-22T01:30:00Z', alert_seq: outage.seq, recover_seq: recovered.seq, kind: 'down' },
    { id: 2, started_at: '2026-10-22T02:00:00Z', detected_at: '2026-10-22T02:03:00Z', ended_at: null, alert_seq: unready.seq, recover_seq: null, kind: 'unready' },
  ]);
});

test('it reads no rows when no outage was opened', () => {
  const ctx = setupTest();

  expect(readOutageRows(ctx.db)).toStrictEqual([]);
});
