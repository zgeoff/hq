import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedOpenAsk } from './seed-open-ask.ts';
import { seedSecondOpenAsk } from './seed-second-open-ask.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readAsks: () => fresh.db.query('SELECT id, title, state FROM asks ORDER BY id').all() };
}

test('#seedSecondOpenAsk puts an ask in the open state, and input overrides apply', () => {
  const ctx = setupTest();

  seedSecondOpenAsk(ctx, { id: 'geo-2-fence', title: 'Mend the fence' });

  expect(ctx.readAsks()).toStrictEqual([{ id: 'geo-2-fence', title: 'Mend the fence', state: 'open' }]);
});

test('#seedSecondOpenAsk fails on the unique index when another ask is open', () => {
  const ctx = setupTest();
  seedOpenAsk(ctx, { id: 'geo-1-paint' });

  expect(() => seedSecondOpenAsk(ctx, { id: 'geo-2-fence' })).toThrow('UNIQUE');
});
