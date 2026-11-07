import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readOutageRows } from './read-outage-rows.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads every outage row, oldest first', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO outages (started_at, detected_at, ended_at) VALUES ('2026-10-22T01:00:00Z', '2026-10-22T01:01:00Z', '2026-10-22T01:30:00Z')");
  ctx.db.run("INSERT INTO outages (started_at, detected_at, kind) VALUES ('2026-10-22T02:00:00Z', '2026-10-22T02:03:00Z', 'unready')");

  expect(readOutageRows(ctx.db)).toStrictEqual([
    { id: 1, started_at: '2026-10-22T01:00:00Z', detected_at: '2026-10-22T01:01:00Z', ended_at: '2026-10-22T01:30:00Z', alert_seq: null, recover_seq: null, kind: 'down' },
    { id: 2, started_at: '2026-10-22T02:00:00Z', detected_at: '2026-10-22T02:03:00Z', ended_at: null, alert_seq: null, recover_seq: null, kind: 'unready' },
  ]);
});

test('it reads no rows when no outage was opened', () => {
  const ctx = setupTest();

  expect(readOutageRows(ctx.db)).toStrictEqual([]);
});
