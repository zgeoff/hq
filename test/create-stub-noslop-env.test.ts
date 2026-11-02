import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { getMeta } from '../src/db/get-meta.ts';
import { createStubNoslopEnv } from './create-stub-noslop-env.ts';
import { freshDb } from './helpers.ts';

test('it pins noslop in the database and points the review folders at a temp folder', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  createStubNoslopEnv(fresh.db);

  expect(JSON.parse(getMeta(fresh.db, 'noslop') ?? 'null')).toStrictEqual({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' });
  expect(existsSync(process.env['HQ_NOSLOP_OP_SETTINGS'] ?? '')).toBe(true);
});
