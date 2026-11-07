import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { userVersion } from './user-version.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  return { db };
}

test('it returns 0 for a database no migration has touched', () => {
  const ctx = setupTest();

  expect(userVersion(ctx.db)).toBe(0);
});

test('it returns the version the database was last set to', () => {
  const ctx = setupTest();
  ctx.db.exec('PRAGMA user_version = 17');

  expect(userVersion(ctx.db)).toBe(17);
});
