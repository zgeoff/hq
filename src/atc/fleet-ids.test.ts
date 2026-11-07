import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { setMeta } from '../db/set-meta.ts';
import { fleetIds } from './fleet-ids.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return { db };
}

test('#fleetIds reads the stored name to session ID map', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'id-1' }));

  expect(fleetIds(ctx.db)).toStrictEqual({ 'z-kettle': 'id-1' });
});

test('#fleetIds drops a stored value that is not a string', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'id-1', 'z-toaster': 7 }));

  expect(fleetIds(ctx.db)).toStrictEqual({ 'z-kettle': 'id-1' });
});

test.each([['not json'], ['[1, 2]'], ['null']])('#fleetIds returns an empty map for the stored text %s', (stored) => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', stored);

  expect(fleetIds(ctx.db)).toStrictEqual({});
});
