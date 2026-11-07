import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { buildDeclaredColumns } from '../test-utils/build-declared-columns.ts';
import { collectDeclaredEnums } from '../test-utils/collect-declared-enums.ts';
import { collectGeneratedColumns } from '../test-utils/collect-generated-columns.ts';
import { readCheckedValues } from '../test-utils/read-checked-values.ts';
import { readSoleIntegerKeys } from '../test-utils/read-sole-integer-keys.ts';
import { readDescribedColumns } from '../test-utils/read-described-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(() => fresh.cleanup());
  return { readActual: () => readDescribedColumns(fresh.db), readChecked: (columns: readonly string[]) => readCheckedValues(fresh.db, columns), readSoleKeys: (columns: readonly string[]) => readSoleIntegerKeys(fresh.db, columns) };
}

test('it declares every table of a migrated database with its columns and nullability', () => {
  const ctx = setupTest();

  expect(buildDeclaredColumns(HQ_COLUMNS)).toStrictEqual(ctx.readActual());
});

test('it declares each union column with the values its CHECK constraint allows in a migrated database', () => {
  const ctx = setupTest();
  const declared = collectDeclaredEnums(HQ_COLUMNS);

  expect(declared).toStrictEqual(ctx.readChecked(Object.keys(declared)));
});

test('it declares a generated column only where the migrated table has that column as its sole INTEGER primary key', () => {
  const ctx = setupTest();
  const declared = collectGeneratedColumns(HQ_COLUMNS);

  expect(ctx.readSoleKeys(declared)).toStrictEqual(declared);
});
