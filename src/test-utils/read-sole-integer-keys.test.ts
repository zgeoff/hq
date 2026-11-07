import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { readSoleIntegerKeys } from './read-sole-integer-keys.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  return { db };
}

test('it keeps the columns that are the only INTEGER primary key of their table', () => {
  const ctx = setupTest();
  ctx.db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
  ctx.db.run('CREATE TABLE tags (name TEXT PRIMARY KEY, rank INTEGER)');
  ctx.db.run('CREATE TABLE pairs (a INTEGER, b INTEGER, PRIMARY KEY (a, b))');

  expect(readSoleIntegerKeys(ctx.db, ['notes.id', 'notes.title', 'tags.name', 'tags.rank', 'pairs.a'])).toStrictEqual(['notes.id']);
});
