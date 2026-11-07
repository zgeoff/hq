import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { queryColumn, queryRow, queryRows, queryValue, readRow } from './query-rows.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, actionSchema: z.object({ action: z.string() }) };
}

test('it reads every row that matches, dropping columns the schema omits', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);
  logEvent(ctx.db, 'ask', 'ask-1', 'tea-poured', 'bo', null, null);

  expect(queryRows(ctx.db, 'SELECT * FROM events ORDER BY seq', ctx.actionSchema)).toStrictEqual([{ action: 'kettle-boiled' }, { action: 'tea-poured' }]);
});

test('it binds the values it is given', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);
  logEvent(ctx.db, 'ask', 'ask-1', 'tea-poured', 'bo', null, null);

  expect(queryRows(ctx.db, 'SELECT action FROM events WHERE actor = ?', ctx.actionSchema, 'bo')).toStrictEqual([{ action: 'tea-poured' }]);
});

test('it rejects a row that does not fit the schema', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);

  expect(() => queryRows(ctx.db, 'SELECT to_state FROM events', z.object({ to_state: z.string() }))).toThrow(/to_state/u);
});

test('it reads null when a query that can miss returns no row', () => {
  const ctx = setupTest();

  expect(readRow(ctx.db, 'SELECT action FROM events', ctx.actionSchema)).toBeNull();
});

test('it reads the first row of a query that can miss', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);
  logEvent(ctx.db, 'ask', 'ask-1', 'tea-poured', 'bo', null, null);

  expect(readRow(ctx.db, 'SELECT action FROM events ORDER BY seq', ctx.actionSchema)).toStrictEqual({ action: 'kettle-boiled' });
});

test('it throws when a query that must return a row returns none', () => {
  const ctx = setupTest();

  expect(() => queryRow(ctx.db, 'SELECT action FROM events', ctx.actionSchema)).toThrow(/no row/u);
});

test('it returns the first row of a query that must return one', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);

  expect(queryRow(ctx.db, 'SELECT action FROM events', ctx.actionSchema)).toStrictEqual({ action: 'kettle-boiled' });
});

test('it reads the first column of every row', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);
  logEvent(ctx.db, 'ask', 'ask-1', 'tea-poured', 'bo', null, null);

  expect(queryColumn(ctx.db, 'SELECT action, actor FROM events ORDER BY seq', z.string())).toStrictEqual(['kettle-boiled', 'tea-poured']);
});

test('it rejects a column value that does not fit the schema', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);

  expect(() => queryColumn(ctx.db, 'SELECT action FROM events', z.number())).toThrow(/number/u);
});

test('it reads the first column of the first row, with the binds it is given', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);
  logEvent(ctx.db, 'ask', 'ask-1', 'tea-poured', 'bo', null, null);

  expect(queryValue(ctx.db, 'SELECT action FROM events WHERE actor = ?', z.string(), 'bo')).toBe('tea-poured');
});

test('it reads a null first column when the schema allows one', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'ask', 'ask-1', 'kettle-boiled', 'ada', null, null);

  expect(queryValue(ctx.db, 'SELECT to_state FROM events', z.string().nullable())).toBeNull();
});

test('it throws when a query that must return a value returns no row', () => {
  const ctx = setupTest();

  expect(() => queryValue(ctx.db, 'SELECT action FROM events', z.string())).toThrow(/no row/u);
});
