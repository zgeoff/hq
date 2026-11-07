import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { findRow, queryRow, queryRows } from './query-rows.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, owner TEXT)');
  return { db };
}

const TitleSchema = z.object({ title: z.string() });

test('it reads every row that matches, dropping columns the schema omits', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', 'ada'), ('Taxes', 'bo')");

  expect(queryRows(ctx.db, 'SELECT * FROM notes ORDER BY id', TitleSchema)).toStrictEqual([{ title: 'Groceries' }, { title: 'Taxes' }]);
});

test('it binds the values it is given', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', 'ada'), ('Taxes', 'bo')");

  expect(queryRows(ctx.db, 'SELECT title FROM notes WHERE owner = ?', TitleSchema, 'bo')).toStrictEqual([{ title: 'Taxes' }]);
});

test('it rejects a row that does not fit the schema', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', NULL)");

  expect(() => queryRows(ctx.db, 'SELECT owner FROM notes', z.object({ owner: z.string() }))).toThrow(/owner/u);
});

test('it reads the first row, or null when there is none', () => {
  const ctx = setupTest();

  expect(findRow(ctx.db, 'SELECT title FROM notes', TitleSchema)).toBeNull();

  ctx.db.run("INSERT INTO notes (title) VALUES ('Groceries')");

  expect(findRow(ctx.db, 'SELECT title FROM notes', TitleSchema)).toStrictEqual({ title: 'Groceries' });
});

test('it throws when a query that must return a row returns none', () => {
  const ctx = setupTest();

  expect(() => queryRow(ctx.db, 'SELECT title FROM notes', TitleSchema)).toThrow(/no row/u);
});

test('it returns the first row of a query that must return one', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title) VALUES ('Groceries')");

  expect(queryRow(ctx.db, 'SELECT title FROM notes', TitleSchema)).toStrictEqual({ title: 'Groceries' });
});
