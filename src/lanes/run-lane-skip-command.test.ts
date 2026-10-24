import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { runLaneSkipCommand } from './run-lane-skip-command.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it stores a skip with its until normalized to an ISO time, and logs it', () => {
  const ctx = setupTest();

  const out = runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9861', until: '2026-10-16T09:00:00.000Z', reason: ' the kettle vendor answers tomorrow ' } });

  expect(out.data).toStrictEqual({ skip: { issue: 'GEO-9861', until: '2026-10-16T09:00:00Z', reason: 'the kettle vendor answers tomorrow', by: 'z-delivery', at: '2026-10-15T20:00:00Z' } });
  expect(ctx.db.query("SELECT actor, data FROM events WHERE action = 'skip-set'").all()).toStrictEqual([
    { actor: 'z-delivery', data: JSON.stringify({ issue: 'GEO-9861', until: '2026-10-16T09:00:00Z', reason: 'the kettle vendor answers tomorrow' }) },
  ]);
});

test('it replaces the skip an issue already had', () => {
  const ctx = setupTest();
  runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9861', until: 'GEO-9869', reason: 'waits on the descaler PR' } });

  runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:05:00Z'), args: { kind: 'set', issue: 'GEO-9861', until: '2026-10-17T00:00:00Z', reason: 'held for the vendor' } });

  expect(readLaneSkips(ctx.db)).toStrictEqual([{ issue: 'GEO-9861', until: '2026-10-17T00:00:00Z', reason: 'held for the vendor', by: 'z-delivery', at: '2026-10-15T20:05:00Z' }]);
});

test('it lists only the skips still in force', () => {
  const ctx = setupTest();
  runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9861', until: '2026-10-15T21:00:00Z', reason: 'held for an hour' } });
  runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9862', until: 'GEO-9869', reason: 'waits on the descaler PR' } });

  const out = runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T22:00:00Z'), args: { kind: 'list' } });

  expect(out.text).toBe('Lane skips:\n  GEO-9862 until GEO-9869: waits on the descaler PR (z-delivery, 2026-10-15T20:00:00Z)');
});

test('it lists why hq cannot tell when a skip ends, after a Ready tick failed to read its until issue', () => {
  const ctx = setupTest();
  runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9862', until: 'GEO-9869', reason: 'waits on the descaler PR' } });
  setMeta(ctx.db, 'lanes_skips_unread', JSON.stringify({ 'GEO-9869': 'Linear has no issue GEO-9869' }));

  const out = runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:05:00Z'), args: { kind: 'list' } });

  expect(out.text).toBe('Lane skips:\n  GEO-9862 until GEO-9869: waits on the descaler PR (z-delivery, 2026-10-15T20:00:00Z); hq cannot tell when it ends: Linear has no issue GEO-9869');
});

test('it drops a skip and logs it, and says so when the issue had none', () => {
  const ctx = setupTest();
  runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9861', until: 'GEO-9869', reason: 'waits on the descaler PR' } });

  const dropped = runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:05:00Z'), args: { kind: 'drop', issue: 'GEO-9861' } });
  const again = runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:05:00Z'), args: { kind: 'drop', issue: 'GEO-9861' } });

  expect(dropped.data).toStrictEqual({ issue: 'GEO-9861', dropped: true });
  expect(again.data).toStrictEqual({ issue: 'GEO-9861', dropped: false });
  expect(readLaneSkips(ctx.db)).toStrictEqual([]);
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'skip-dropped'").get()).toStrictEqual({ total: 1 });
});

test.each([
  { label: 'a past time', until: '2026-10-15T19:00:00Z', reason: 'held', message: '--until 2026-10-15T19:00:00Z has passed; give a later time' },
  { label: 'an until that is no time, issue or PR', until: 'tomorrow', reason: 'held', message: '--until takes an ISO time, such as 2026-11-02T09:00:00Z, an issue like GEO-123, or a PR like pr:repo#12, not "tomorrow"' },
  { label: 'an until naming the issue itself', until: 'GEO-9861', reason: 'held', message: '--until names GEO-9861 itself; give another issue, a PR or a time' },
  { label: 'an empty reason', until: '2026-10-16T09:00:00Z', reason: '  ', message: '--reason must say why' },
])('it refuses $label with bad_args and stores nothing', (row) => {
  const ctx = setupTest();

  expect(() => runLaneSkipCommand({ db: ctx.db, actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z'), args: { kind: 'set', issue: 'GEO-9861', until: row.until, reason: row.reason } })).toThrow(
    expect.objectContaining({ code: 'bad_args', message: expect.stringContaining(row.message) }),
  );
  expect(readLaneSkips(ctx.db)).toStrictEqual([]);
});
