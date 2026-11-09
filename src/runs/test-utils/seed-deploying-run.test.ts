import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedDeployingRun } from './seed-deploying-run.ts';

test('#seedDeployingRun adds a run in the deploying state, and input overrides apply', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);

  seedDeployingRun(fresh, { issue: 'GEO-9002', title: 'Descale the kettle', place: 'local' });

  expect(fresh.db.query('SELECT issue, title, place, state FROM runs').all()).toStrictEqual([{ issue: 'GEO-9002', title: 'Descale the kettle', place: 'local', state: 'deploying' }]);
});
