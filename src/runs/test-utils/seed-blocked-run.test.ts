import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedBlockedRun } from './seed-blocked-run.ts';

test('#seedBlockedRun adds a run in the blocked state, and input overrides apply', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);

  seedBlockedRun(fresh, { issue: 'GEO-9002', title: 'Descale the kettle', place: 'local' });

  expect(fresh.db.query('SELECT issue, title, place, state FROM runs').all()).toStrictEqual([{ issue: 'GEO-9002', title: 'Descale the kettle', place: 'local', state: 'blocked' }]);
});
