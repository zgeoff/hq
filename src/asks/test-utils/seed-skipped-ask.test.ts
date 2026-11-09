import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedSkippedAsk } from './seed-skipped-ask.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readAsks: () => fresh.db.query('SELECT id, kind, title, state FROM asks ORDER BY id').all() };
}

test('#seedSkippedAsk puts an ask in the skipped state, and input overrides apply', () => {
  const ctx = setupTest();

  seedSkippedAsk(ctx, { id: 'geo-2-fence', kind: 'proposal', title: 'Mend the fence' });

  expect(ctx.readAsks()).toStrictEqual([{ id: 'geo-2-fence', kind: 'proposal', title: 'Mend the fence', state: 'skipped' }]);
});

test('#seedSkippedAsk refuses an id an ask already holds', () => {
  const ctx = setupTest();
  seedSkippedAsk(ctx, { id: 'geo-2-fence' });

  expect(() => seedSkippedAsk(ctx, { id: 'geo-2-fence' })).toThrow();
});
