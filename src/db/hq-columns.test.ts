import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { buildDeclaredColumns } from '../test-utils/build-declared-columns.ts';
import { collectDeclaredEnums } from '../test-utils/collect-declared-enums.ts';
import { readCheckedValues } from '../test-utils/read-checked-values.ts';
import { readDescribedColumns } from '../test-utils/read-described-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(() => fresh.cleanup());
  return { readActual: () => readDescribedColumns(fresh.db), readChecked: (columns: readonly string[]) => readCheckedValues(fresh.db, columns) };
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
