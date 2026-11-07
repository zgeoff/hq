import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { readCheckedValues } from './read-checked-values.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  return { db };
}

test('it reads the IN list of each named column from its table, unquoted', () => {
  const ctx = setupTest();
  ctx.db.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open','in review', 'done')))");
  ctx.db.run("CREATE TABLE tags (name TEXT PRIMARY KEY, tone TEXT CHECK (tone IN ('warm')))");

  expect(readCheckedValues(ctx.db, ['notes.state', 'tags.tone'])).toStrictEqual({ 'notes.state': ['open', 'in review', 'done'], 'tags.tone': ['warm'] });
});

test('it reads an empty list for a column with no IN check', () => {
  const ctx = setupTest();
  ctx.db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, state TEXT NOT NULL)');

  expect(readCheckedValues(ctx.db, ['notes.state'])).toStrictEqual({ 'notes.state': [] });
});
