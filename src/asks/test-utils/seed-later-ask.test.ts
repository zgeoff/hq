import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedLaterAsk } from './seed-later-ask.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readAsks: () => fresh.db.query('SELECT id, kind, title, state FROM asks ORDER BY id').all() };
}

test('#seedLaterAsk puts an ask in the later state, and input overrides apply', () => {
  const ctx = setupTest();

  seedLaterAsk(ctx, { id: 'geo-2-fence', kind: 'proposal', title: 'Mend the fence' });

  expect(ctx.readAsks()).toStrictEqual([{ id: 'geo-2-fence', kind: 'proposal', title: 'Mend the fence', state: 'later' }]);
});

test('#seedLaterAsk refuses an id an ask already holds', () => {
  const ctx = setupTest();
  seedLaterAsk(ctx, { id: 'geo-2-fence' });

  expect(() => seedLaterAsk(ctx, { id: 'geo-2-fence' })).toThrow();
});
