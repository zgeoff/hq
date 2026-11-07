import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { queryColumn, queryRow, queryRows, queryValue, readRow } from './query-rows.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, owner TEXT)');
  return { db, titleSchema: z.object({ title: z.string() }) };
}

test('it reads every row that matches, dropping columns the schema omits', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', 'ada'), ('Taxes', 'bo')");

  expect(queryRows(ctx.db, 'SELECT * FROM notes ORDER BY id', ctx.titleSchema)).toStrictEqual([{ title: 'Groceries' }, { title: 'Taxes' }]);
});

test('it binds the values it is given', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', 'ada'), ('Taxes', 'bo')");

  expect(queryRows(ctx.db, 'SELECT title FROM notes WHERE owner = ?', ctx.titleSchema, 'bo')).toStrictEqual([{ title: 'Taxes' }]);
});

test('it rejects a row that does not fit the schema', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', NULL)");

  expect(() => queryRows(ctx.db, 'SELECT owner FROM notes', z.object({ owner: z.string() }))).toThrow(/owner/u);
});

test('it reads null when a query that can miss returns no row', () => {
  const ctx = setupTest();

  expect(readRow(ctx.db, 'SELECT title FROM notes', ctx.titleSchema)).toBeNull();
});

test('it reads the first row of a query that can miss', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title) VALUES ('Groceries'), ('Taxes')");

  expect(readRow(ctx.db, 'SELECT title FROM notes ORDER BY id', ctx.titleSchema)).toStrictEqual({ title: 'Groceries' });
});

test('it throws when a query that must return a row returns none', () => {
  const ctx = setupTest();

  expect(() => queryRow(ctx.db, 'SELECT title FROM notes', ctx.titleSchema)).toThrow(/no row/u);
});

test('it returns the first row of a query that must return one', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title) VALUES ('Groceries')");

  expect(queryRow(ctx.db, 'SELECT title FROM notes', ctx.titleSchema)).toStrictEqual({ title: 'Groceries' });
});

test('it reads the first column of every row', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', 'ada'), ('Taxes', 'bo')");

  expect(queryColumn(ctx.db, 'SELECT title, owner FROM notes ORDER BY id', z.string())).toStrictEqual(['Groceries', 'Taxes']);
});

test('it rejects a column value that does not fit the schema', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title) VALUES ('Groceries')");

  expect(() => queryColumn(ctx.db, 'SELECT title FROM notes', z.number())).toThrow(/number/u);
});

test('it reads the first column of the first row, with the binds it is given', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', 'ada'), ('Taxes', 'bo')");

  expect(queryValue(ctx.db, 'SELECT title FROM notes WHERE owner = ?', z.string(), 'bo')).toBe('Taxes');
});

test('it reads a null first column when the schema allows one', () => {
  const ctx = setupTest();
  ctx.db.run("INSERT INTO notes (title, owner) VALUES ('Groceries', NULL)");

  expect(queryValue(ctx.db, 'SELECT owner FROM notes', z.string().nullable())).toBeNull();
});

test('it throws when a query that must return a value returns no row', () => {
  const ctx = setupTest();

  expect(() => queryValue(ctx.db, 'SELECT title FROM notes', z.string())).toThrow(/no row/u);
});
