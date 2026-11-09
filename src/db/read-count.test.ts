import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { sql } from 'kysely';
import { kdb } from '../kdb.ts';
import { readCount } from './read-count.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  // The SQL is the unit under test, so the test writes it directly.
  db.run("INSERT INTO meta (key, value) VALUES ('a', '1'), ('b', '2'), ('c', '3')");
  return { db, countAbove: (key: string) => sql`SELECT COUNT(*) AS count FROM meta WHERE key > ${key}`.compile(kdb(db)) };
}

test('it reads the count of the rows a query matches', () => {
  const ctx = setupTest();

  expect(readCount(ctx.db, ctx.countAbove('a'))).toBe(2);
});

test('it reads 0 when no row matches', () => {
  const ctx = setupTest();

  expect(readCount(ctx.db, ctx.countAbove('z'))).toBe(0);
});
