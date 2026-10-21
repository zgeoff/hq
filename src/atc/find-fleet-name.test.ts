import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { findFleetName } from './find-fleet-name.ts';

test('whois names the declared session hq fleet last saw under an id, and no other', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'id-stu', 'z-kettle': 'id-kettle' }));
  expect([findFleetName(fresh.db, 'id-stu'), findFleetName(fresh.db, 'id-teapot')]).toStrictEqual(['z-stu', null]);
});
