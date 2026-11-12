import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { readKnownFleetIDs } from './read-known-fleet-ids.ts';

test('it gives a declared name the id recorded under the retired name that forwards to it', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-oldkettle': 'id-k' }));
  setMeta(fresh.db, 'outbox_forwards', JSON.stringify({ 'z-oldkettle': 'z-kettle' }));

  expect(readKnownFleetIDs(fresh.db)).toStrictEqual({ 'z-oldkettle': 'id-k', 'z-kettle': 'id-k' });
});

test('it keeps the id recorded under the declared name over a retired one', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-oldkettle': 'id-old', 'z-kettle': 'id-k' }));
  setMeta(fresh.db, 'outbox_forwards', JSON.stringify({ 'z-oldkettle': 'z-kettle' }));

  expect(readKnownFleetIDs(fresh.db)).toStrictEqual({ 'z-oldkettle': 'id-old', 'z-kettle': 'id-k' });
});
