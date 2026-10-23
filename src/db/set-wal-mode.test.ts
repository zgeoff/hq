import { expect, mock, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setWALMode } from './set-wal-mode.ts';

// A new database file and a second connection to it that already holds the write lock.
function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-wal-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const holder = new Database(join(directory, 'kettle.db'), { create: true, strict: true });
  onTestFinished(() => holder.close());
  holder.exec('BEGIN IMMEDIATE');
  const db = new Database(join(directory, 'kettle.db'), { strict: true });
  onTestFinished(() => db.close());
  return { db, holder };
}

test('it switches a new database to WAL once the connection that holds the write lock lets go', () => {
  const ctx = setupTest();
  const sleep = mock(() => ctx.holder.exec('ROLLBACK'));

  setWALMode(ctx.db, 5000, sleep);

  expect(sleep).toHaveBeenCalledTimes(1);
  expect(ctx.db.query('PRAGMA journal_mode').get()).toStrictEqual({ journal_mode: 'wal' });
});

test('it fails with database is locked once the timeout has passed', () => {
  const ctx = setupTest();

  expect(() => setWALMode(ctx.db, 50)).toThrow('database is locked');
});

test('it throws an error other than a busy database at once, with no retry', () => {
  const ctx = setupTest();
  const sleep = mock(() => {});
  ctx.db.exec('BEGIN');

  expect(() => setWALMode(ctx.db, 5000, sleep)).toThrow('cannot change into wal mode from within a transaction');
  expect(sleep).not.toHaveBeenCalled();
});
