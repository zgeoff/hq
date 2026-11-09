import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { metaJson } from './meta-json.ts';
import { strMap } from './str-map.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}

test('it gives the fallback for a missing key', () => {
  const ctx = setupTest();

  expect(metaJson(ctx.db, 'invented_map', strMap, { kettle: 'teapot' })).toStrictEqual({ kettle: 'teapot' });
});

test('it parses a stored value that fits the schema', () => {
  const ctx = setupTest();
  ctx.seed.meta({ key: 'invented_map', value: '{"lid":"glass"}' });

  expect(metaJson(ctx.db, 'invented_map', strMap, {})).toStrictEqual({ lid: 'glass' });
});

test('it throws bad_meta naming the key for a stored value the schema refuses', () => {
  const ctx = setupTest();
  ctx.seed.meta({ key: 'invented_map', value: '{"lid":4}' });

  expect(() => metaJson(ctx.db, 'invented_map', strMap, {})).toThrow(expect.objectContaining({ code: 'bad_meta', message: expect.stringContaining("'invented_map'") }));
});

test('it throws bad_meta naming the key for a stored value that is not JSON', () => {
  const ctx = setupTest();
  ctx.seed.meta({ key: 'invented_map', value: '{not json' });

  expect(() => metaJson(ctx.db, 'invented_map', z.array(z.string()), [])).toThrow(expect.objectContaining({ code: 'bad_meta', message: expect.stringContaining("'invented_map'") }));
});
