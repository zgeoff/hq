import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { seedEventWithBrokenData } from './seed-event-with-broken-data.ts';

test('#seedEventWithBrokenData stores an event whose data is not JSON, and input overrides apply', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);

  seedEventWithBrokenData(fresh, { subjectID: 'pr:widgets#7', action: 'pr-override' });

  expect(fresh.db.query('SELECT subject, subject_id, action, actor, at, data FROM events').all()).toStrictEqual([{ subject: 'hq', subject_id: 'pr:widgets#7', action: 'pr-override', actor: 'kettle-bot', at: '2026-10-14T01:00:00Z', data: '{' }]);
});
