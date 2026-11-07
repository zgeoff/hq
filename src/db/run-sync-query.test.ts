import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { kdb } from '../kdb.ts';
import { runSyncQuery } from './run-sync-query.ts';
import { runSyncRow } from './run-sync-row.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.run("INSERT INTO meta (key, value) VALUES ('a', '1'), ('b', '2'), ('c', '3')");
  return { db, query: kdb(db).selectFrom('meta').select(['key', 'value']).where('key', '!=', 'c').orderBy('key').compile() };
}

const rowSchema = z.object({ key: z.string(), value: z.string() });

test('it returns every row of a compiled query, parsed', () => {
  const ctx = setupTest();

  expect(runSyncQuery(ctx.db, ctx.query, rowSchema)).toStrictEqual([
    { key: 'a', value: '1' },
    { key: 'b', value: '2' },
  ]);
});

test('it returns no rows as an empty list', () => {
  const ctx = setupTest();
  const query = kdb(ctx.db).selectFrom('meta').select(['key', 'value']).where('key', '=', 'zzz').compile();

  expect(runSyncQuery(ctx.db, query, rowSchema)).toStrictEqual([]);
});

test('it throws when a row does not match the schema', () => {
  const ctx = setupTest();

  expect(() => runSyncQuery(ctx.db, ctx.query, z.object({ key: z.string(), value: z.number() }))).toThrow();
});

test('it throws instead of binding undefined', () => {
  const ctx = setupTest();
  const query = kdb(ctx.db).selectFrom('meta').select(['key']).where('key', '=', undefined as never).compile();

  expect(() => runSyncQuery(ctx.db, query, rowSchema)).toThrow();
});

test('it returns the first row of a compiled query, parsed', () => {
  const ctx = setupTest();

  expect(runSyncRow(ctx.db, ctx.query, rowSchema)).toStrictEqual({ key: 'a', value: '1' });
});

test('it returns null when the query has no row', () => {
  const ctx = setupTest();
  const query = kdb(ctx.db).selectFrom('meta').select(['key', 'value']).where('key', '=', 'zzz').compile();

  expect(runSyncRow(ctx.db, query, rowSchema)).toBeNull();
});
