import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedRefusal } from './seed-refusal.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRefusals: () => fresh.db.query('SELECT uuid, at, transcript, subagent, issue, reason, scanned_at FROM refusals ORDER BY uuid').all() };
}

test('#seedRefusal stores a refusal, and input overrides apply', () => {
  const ctx = setupTest();

  seedRefusal(ctx, { uuid: 'u9', reason: 'the kettle was cold' });

  expect(ctx.readRefusals()).toStrictEqual([{ uuid: 'u9', at: '2026-10-14T03:00:00Z', transcript: '/t.jsonl', subagent: 0, issue: null, reason: 'the kettle was cold', scanned_at: '2026-10-14T04:00:00Z' }]);
});

test('#seedRefusal refuses a second refusal with the same uuid', () => {
  const ctx = setupTest();
  seedRefusal(ctx, { uuid: 'u9' });

  expect(() => seedRefusal(ctx, { uuid: 'u9' })).toThrow();
});
