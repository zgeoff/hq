import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedLiveCheckRun } from './seed-live-check-run.ts';

test('#seedLiveCheckRun adds a run in the live-check state, and input overrides apply', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);

  seedLiveCheckRun(fresh, { issue: 'GEO-9002', title: 'Descale the kettle', place: 'local' });

  expect(fresh.db.query('SELECT issue, title, place, state FROM runs').all()).toStrictEqual([{ issue: 'GEO-9002', title: 'Descale the kettle', place: 'local', state: 'live-check' }]);
});
