import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(() => fresh.cleanup());
  return { db: fresh.db };
}

function describeSpec(spec: string | { readonly nullable: boolean }): string {
  if (typeof spec === 'string') {
    return spec;
  }
  return spec.nullable ? 'text?' : 'text';
}

test('it declares every table of a migrated database with its columns and nullability', () => {
  const ctx = setupTest();
  const tables = ctx.db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const actual: Record<string, Record<string, string>> = {};
  for (const table of tables) {
    const columns = ctx.db.query<{ name: string; type: string; notnull: number; pk: number }, [string]>('SELECT name, type, "notnull", pk FROM pragma_table_info(?) ORDER BY cid').all(table.name);
    actual[table.name] = Object.fromEntries(columns.map((column) => [column.name, `${column.type.toLowerCase()}${column.notnull === 0 && column.pk === 0 ? '?' : ''}`]));
  }
  const declared = Object.fromEntries(Object.entries(HQ_COLUMNS).map(([table, columns]) => [table, Object.fromEntries(Object.entries(columns).map(([column, spec]) => [column, describeSpec(spec)]))]));

  expect(declared).toStrictEqual(actual);
});
