import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { findFleetName } from './find-fleet-name.ts';

test('whois names the declared session hq fleet last saw under an id, and no other', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-teapot': 'id-teapot', 'z-kettle': 'id-kettle' }));
  expect([findFleetName(fresh.db, 'id-kettle'), findFleetName(fresh.db, 'id-cup')]).toStrictEqual(['z-kettle', null]);
});

test('it names the session a retired name forwards to, when hq fleet last saw the id under the retired name', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-refine': 'id-refine' }));
  expect(findFleetName(fresh.db, 'id-refine')).toBe('z-triage');
});
