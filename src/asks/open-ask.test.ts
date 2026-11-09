import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}

test('the schema itself refuses a second open row', () => {
  const ctx = setupTest();
  ctx.seed.openAsk({ id: 'geo-1-paint' });

  expect(() => ctx.seed.secondOpenAsk({ id: 'geo-2-fence' })).toThrow('UNIQUE');
});
