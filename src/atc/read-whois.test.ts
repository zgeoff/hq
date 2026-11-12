import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { roleName } from '../roles/role-name.ts';
import { readWhois } from './read-whois.ts';

test("it gives the owner's session its name and the owner role, so the band needs no name of its own", () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ [roleName('owner')]: 'id-owner' }));

  expect(readWhois(fresh.db, 'id-owner')).toStrictEqual({ session: 'id-owner', name: roleName('owner'), roles: ['owner'] });
});

test('it gives the declared session a retired name forwards to, with its roles', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-refine': 'id-refine' }));

  expect(readWhois(fresh.db, 'id-refine')).toStrictEqual({ session: 'id-refine', name: 'z-triage', roles: ['triage'] });
});

test('it gives no name and no roles for an id hq fleet never saw', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  expect(readWhois(fresh.db, 'id-teapot')).toStrictEqual({ session: 'id-teapot', name: null, roles: [] });
});
