import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRunBeforeDesignLanes } from './seed-run-before-design-lanes.ts';

test('#seedRunBeforeDesignLanes adds a working run with no design lane', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);

  seedRunBeforeDesignLanes(fresh, { design: 'agent' });

  expect(fresh.db.query('SELECT state, design_lane FROM runs').all()).toStrictEqual([{ state: 'working', design_lane: null }]);
});
