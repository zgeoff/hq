import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { listUmbrellaBoxes } from './list-umbrella-boxes.ts';
import { recordUmbrellaBox } from './record-umbrella-box.ts';
import type { UmbrellaOutcome } from './types.ts';
import { writeUmbrellaOutcome } from './write-umbrella-outcome.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it decides an undecided box', () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt: '2026-10-20T06:00:00Z' });
  const [box] = listUmbrellaBoxes(ctx.db);
  if (box === undefined) throw new Error('the box was not recorded');

  const written = writeUmbrellaOutcome(ctx.db, box, 'news');

  expect(written).toBe(true);
  expect(ctx.db.query('SELECT outcome FROM umbrella_boxes').all()).toStrictEqual([{ outcome: 'news' }]);
});

test('it returns false and keeps the first outcome when another run decided the box after it was read', () => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt: '2026-10-20T06:00:00Z' });
  const [box] = listUmbrellaBoxes(ctx.db);
  if (box === undefined) throw new Error('the box was not recorded');
  writeUmbrellaOutcome(ctx.db, box, 'ticked');

  const written = writeUmbrellaOutcome(ctx.db, box, 'news');

  expect(written).toBe(false);
  expect(ctx.db.query('SELECT outcome FROM umbrella_boxes').all()).toStrictEqual([{ outcome: 'ticked' }]);
});

test.each<[UmbrellaOutcome, UmbrellaOutcome]>([
  ['news', 'gone'],
  ['ticked', 'news'],
  ['no_box', 'news'],
  ['ambiguous', 'ticked'],
  ['gone', 'news'],
])('it refuses to move a box decided as %s to %s', (decided, next) => {
  const ctx = setupTest();
  recordUmbrellaBox(ctx.db, { repo: 'tools', number: 7, issue: 'GEO-9001', mergedAt: '2026-10-20T06:00:00Z' });
  const [box] = listUmbrellaBoxes(ctx.db);
  if (box === undefined) throw new Error('the box was not recorded');
  writeUmbrellaOutcome(ctx.db, box, decided);
  const [stored] = listUmbrellaBoxes(ctx.db);
  if (stored === undefined) throw new Error('the box was not stored');

  expect(() => writeUmbrellaOutcome(ctx.db, stored, next)).toThrow(expect.objectContaining({ code: 'bad_state', data: { state: decided } }));
  expect(ctx.db.query('SELECT outcome FROM umbrella_boxes').all()).toStrictEqual([{ outcome: decided }]);
});
