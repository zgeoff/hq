import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { kdb } from '../kdb.ts';
import { runSyncQuery } from './run-sync-query.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  // The SQL is the unit under test, so the test writes it directly.
  db.run("INSERT INTO meta (key, value) VALUES ('a', '1'), ('b', '2'), ('c', '3')");
  return {
    db,
    schema: z.object({ key: z.string(), value: z.string() }),
    queryBefore: (key: string) => kdb(db).selectFrom('meta').select(['key', 'value']).where('key', '<', key).orderBy('key').compile(),
  };
}

test('it returns every row of a compiled query, parsed', () => {
  const ctx = setupTest();

  expect(runSyncQuery(ctx.db, ctx.queryBefore('c'), ctx.schema)).toStrictEqual([
    { key: 'a', value: '1' },
    { key: 'b', value: '2' },
  ]);
});

test('it returns no rows as an empty list', () => {
  const ctx = setupTest();

  expect(runSyncQuery(ctx.db, ctx.queryBefore('a'), ctx.schema)).toStrictEqual([]);
});

test('it throws when a row does not match the schema', () => {
  const ctx = setupTest();

  expect(() => runSyncQuery(ctx.db, ctx.queryBefore('c'), z.object({ key: z.string(), value: z.number() }))).toThrow();
});

test('it throws instead of binding undefined', () => {
  const ctx = setupTest();
  const missing: string | undefined = [].at(0);
  const query = kdb(ctx.db)
    .selectFrom('meta')
    .select(['key', 'value'])
    .where((builder) => builder('key', '=', missing ?? builder.val(undefined)))
    .compile();

  expect(() => runSyncQuery(ctx.db, query, ctx.schema)).toThrow();
});
