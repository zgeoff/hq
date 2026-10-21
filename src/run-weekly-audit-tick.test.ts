import { expect, onTestFinished, test } from 'bun:test';
import { at, fakeAtc, freshDb } from '../test/helpers.ts';
import { overrideEnv } from './config/override-env.ts';
import { sydneyUtc } from './morning/sydney-utc.ts';
import { flush } from './outbox/flush.ts';
import { runWeeklyAuditTick } from './run-weekly-audit-tick.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_QUIET', '03-07'));
  return {
    db: fresh.db,
    dir: fresh.dir,
    readOutbox: () => fresh.db.query('SELECT text, topic FROM outbox').all() as { text: string; topic: string }[],
  };
}

test('it tells the owner once, from Monday 09:00 Sydney, with the last 7 days as the window', () => {
  const ctx = setupTest(),
    read = ctx.db.query("INSERT INTO events (subject, subject_id, action, actor, at, data) VALUES ('hq', 'op', 'read', ?, ?, ?)"),
    sample = ctx.db.query('INSERT INTO capacity_samples (at, op_account_used, op_account_limit, op_refused) VALUES (?, ?, 1000, 0)');
  sample.run('2026-10-11T23:00:00Z', 640);
  sample.run('2026-10-12T12:00:00Z', 812);
  sample.run('2026-10-13T13:30:00Z', 90);
  read.run('noslop', '2026-10-11T13:00:00Z', '{"consumer":"noslop","requests":1}');
  read.run('noslop', '2026-10-12T05:00:00Z', '{"consumer":"noslop","requests":1}');
  read.run('linear', '2026-10-12T06:00:00Z', '{"consumer":"linear","requests":3}');
  read.run('noslop', '2026-10-12T13:00:00Z', '{"consumer":"noslop","requests":1}');
  read.run('noslop', '2026-10-18T13:00:00Z', '{"consumer":"noslop","requests":1}');

  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 8, 59))).toBeNull();
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 9, 0))).toMatchObject({ job: 'weekly-audit', key: '2026-10-19', result: 'queued', detail: null });
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 9, 5))).toBeNull();
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 22, 12, 0))).toBeNull();
  expect(ctx.readOutbox()).toStrictEqual([
    {
      text: [
        'Weekly audit due. The window is the last 7 days in Sydney time: Mon, 12 Oct 00:00 to Mon, 19 Oct 00:00 (2026-10-11T13:00Z to 2026-10-18T13:00Z).',
        '',
        "1Password requests by Sydney day: the account's highest reading, hq's own reads, and the rest (approximate: 1Password's day resets on its own clock).",
        '- Mon, 12 Oct: 812 of 1,000. Linear 3, noslop 2, other 807',
        '- Tue, 13 Oct: no reading. noslop 1',
        '- Wed, 14 Oct: 90 of 1,000. other 90',
        '- Thu, 15 Oct: no reading. no hq reads',
        '- Fri, 16 Oct: no reading. no hq reads',
        '- Sat, 17 Oct: no reading. no hq reads',
        '- Sun, 18 Oct: no reading. no hq reads',
      ].join('\n'),
      topic: 'job:weekly-audit:2026-10-19',
    },
  ]);
});

test('it sends only on the Monday: a first run later in the week sends nothing', () => {
  const ctx = setupTest();

  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 20, 0, 0))).toBeNull();
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 23, 12, 0))).toBeNull();
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 23, 59))).toMatchObject({ key: '2026-10-19', detail: 'late' });
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 26, 9, 0))).toMatchObject({ key: '2026-10-26' });
  expect(ctx.readOutbox().map((o) => o.topic)).toStrictEqual(['job:weekly-audit:2026-10-19', 'job:weekly-audit:2026-10-26']);
});

test('it holds the message in the quiet hours', () => {
  const ctx = setupTest(),
    restore = overrideEnv('HQ_QUIET', '09-11');

  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 10, 0))).toBeNull();
  restore();
  expect(runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 11, 0))).toMatchObject({ key: '2026-10-19' });
});

test('the window spans the October daylight-saving change', () => {
  const ctx = setupTest();
  runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 5, 9, 0));

  expect(ctx.readOutbox()[0]?.text).toContain('(2026-09-27T14:00Z to 2026-10-04T13:00Z)');
});

test('a first tick after 09:30 marks the message late', () => {
  const ctx = setupTest();
  runWeeklyAuditTick(ctx.db, 'hq', sydneyUtc(2026, 10, 19, 11, 0));

  expect(ctx.readOutbox()[0]?.text).toStartWith('Weekly audit due (late: hq did not run at 09:00). The window');
});

test('the outbox holds an unsent audit message through the quiet hours and sends it after them', async () => {
  const app = setupTest(),
    atc = fakeAtc(app.dir);
  onTestFinished(() => atc.stop());
  onTestFinished(overrideEnv('HQ_NOTIFY', undefined));
  runWeeklyAuditTick(app.db, 'hq', sydneyUtc(2026, 10, 19, 9, 0));
  at(sydneyUtc(2026, 10, 20, 3, 30).toISOString());
  await expect(flush(app.db)).resolves.toMatchObject({ sent: 0, failed: 0 });
  expect(atc.sent).toStrictEqual([]);

  at(sydneyUtc(2026, 10, 20, 7, 0).toISOString());
  await expect(flush(app.db)).resolves.toMatchObject({ sent: 1 });
  expect(atc.sent[0]?.text).toStartWith('Weekly audit due.');
});
