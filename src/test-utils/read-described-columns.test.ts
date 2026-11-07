import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { readDescribedColumns } from './read-described-columns.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  return { db };
}

test('it marks a nullable non-key column and leaves keys and required columns plain', () => {
  const ctx = setupTest();
  ctx.db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT, rank REAL)');
  ctx.db.run('CREATE TABLE tags (name TEXT PRIMARY KEY)');

  expect(readDescribedColumns(ctx.db)).toStrictEqual({
    notes: { id: 'integer', title: 'text', body: 'text?', rank: 'real?' },
    tags: { name: 'text' },
  });
});
