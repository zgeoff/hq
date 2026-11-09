import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { seedAskEventsWithoutDetail } from './seed-ask-events-without-detail.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readEvents: () => fresh.db.query('SELECT subject, subject_id, action, at, data FROM events').all() };
}

test('#seedAskEventsWithoutDetail stores one answered ask event with no title, issues or session', () => {
  const ctx = setupTest();

  seedAskEventsWithoutDetail(ctx, { subject_id: 'kettle-lid', data: '{"answer":"Glass","title":"Pick a lid","issues":["GEO-9001"],"forSession":"kettle-bot"}' });

  expect(ctx.readEvents()).toStrictEqual([{ subject: 'ask', subject_id: 'kettle-lid', action: 'answered', at: '2026-10-14T01:00:00Z', data: '{"answer":"Glass"}' }]);
});

test('#seedAskEventsWithoutDetail applies input overrides', () => {
  const ctx = setupTest();

  seedAskEventsWithoutDetail(ctx, { action: 'added', data: '{"body":"Which lid?"}' });

  expect(ctx.readEvents()).toMatchObject([{ action: 'added', data: '{"body":"Which lid?"}' }]);
});
