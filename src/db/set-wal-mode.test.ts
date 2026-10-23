import { expect, mock, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setWALMode } from './set-wal-mode.ts';

// A new database file and two connections to it: the one under test and a holder for its write lock.
function setupTest() {
  const stack = new DisposableStack();
  onTestFinished(() => stack.dispose());
  const directory = mkdtempSync(join(tmpdir(), 'hq-wal-'));
  stack.defer(() => rmSync(directory, { recursive: true, force: true }));
  const holder = new Database(join(directory, 'kettle.db'), { create: true, strict: true });
  stack.defer(() => holder.close());
  const db = new Database(join(directory, 'kettle.db'), { strict: true });
  stack.defer(() => db.close());
  return { db, holder };
}

test('it switches a new database to WAL once the connection that holds the write lock lets go', () => {
  const ctx = setupTest();
  ctx.holder.exec('BEGIN IMMEDIATE');
  const sleep = mock(() => ctx.holder.exec('ROLLBACK'));

  setWALMode(ctx.db, 5000, sleep);

  expect(sleep).toHaveBeenCalledTimes(1);
  expect(ctx.db.query('PRAGMA journal_mode').get()).toStrictEqual({ journal_mode: 'wal' });
});

test('it fails with database is locked once the timeout has passed', () => {
  const ctx = setupTest();
  ctx.holder.exec('BEGIN IMMEDIATE');

  expect(() => setWALMode(ctx.db, 50)).toThrow('database is locked');
});

test('it throws an error other than a busy database at once, with no retry', () => {
  const ctx = setupTest();
  ctx.holder.exec('BEGIN IMMEDIATE');
  const sleep = mock(() => {});
  ctx.db.exec('BEGIN');

  expect(() => setWALMode(ctx.db, 5000, sleep)).toThrow('cannot change into wal mode from within a transaction');
  expect(sleep).not.toHaveBeenCalled();
});
