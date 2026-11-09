import { expect, test } from 'bun:test';
import { SCHEMA_VERSION } from '../src/db/schema-version.ts';
import { createTestDb } from './create-test-db.ts';

test('it opens a migrated database at the path HQ_DB names', () => {
  const fresh = createTestDb();

  expect([process.env['HQ_DB'], fresh.db.query('PRAGMA user_version').get()]).toStrictEqual([fresh.path, { user_version: SCHEMA_VERSION }]);
});
