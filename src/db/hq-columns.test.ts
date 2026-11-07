import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { buildDeclaredColumns } from '../test-utils/build-declared-columns.ts';
import { readDescribedColumns } from '../test-utils/read-described-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(() => fresh.cleanup());
  return { readActual: () => readDescribedColumns(fresh.db) };
}

test('it declares every table of a migrated database with its columns and nullability', () => {
  const ctx = setupTest();

  expect(buildDeclaredColumns(HQ_COLUMNS)).toStrictEqual(ctx.readActual());
});
