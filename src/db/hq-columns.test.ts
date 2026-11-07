import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

const tableSchema = z.array(z.object({ name: z.string() }));
const columnSchema = z.array(z.object({ name: z.string(), type: z.string(), notnull: z.number(), pk: z.number() }));

function setupTest() {
  const fresh = freshDb();
  onTestFinished(() => fresh.cleanup());
  return { db: fresh.db };
}

test('it declares every table of a migrated database with its columns and nullability', () => {
  const ctx = setupTest();
  const tables = tableSchema.parse(ctx.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all());
  const actual: Record<string, Record<string, string>> = {};
  for (const table of tables) {
    const columns = columnSchema.parse(ctx.db.query('SELECT name, type, "notnull", pk FROM pragma_table_info(?) ORDER BY cid').all(table.name));
    actual[table.name] = {};
    for (const column of columns) {
      actual[table.name][column.name] = `${column.type.toLowerCase()}${column.notnull === 0 && column.pk === 0 ? '?' : ''}`;
    }
  }
  const declared: Record<string, Record<string, string>> = {};
  for (const [table, columns] of Object.entries(HQ_COLUMNS)) {
    declared[table] = {};
    for (const [column, spec] of Object.entries(columns)) {
      declared[table][column] = typeof spec === 'string' ? spec : `text${spec.nullable ? '?' : ''}`;
    }
  }

  expect(declared).toStrictEqual(actual);
});
