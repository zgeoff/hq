import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import type { ColumnSpec } from '../kdb.ts';
import { freshDb } from '../../test/helpers.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(() => fresh.cleanup());
  return { db: fresh.db };
}

test('it declares every table of a migrated database with its columns and nullability', () => {
  const ctx = setupTest();
  const tables = z.array(z.object({ name: z.string() })).parse(ctx.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all());
  const columnSchema = z.array(z.object({ name: z.string(), type: z.string(), notnull: z.number(), pk: z.number() }));
  const actual: Record<string, Record<string, string>> = {};
  for (const table of tables) {
    const columns = columnSchema.parse(ctx.db.query('SELECT name, type, "notnull", pk FROM pragma_table_info(?) ORDER BY cid').all(table.name));
    const described: Record<string, string> = {};
    for (const column of columns) {
      described[column.name] = `${column.type.toLowerCase()}${column.notnull === 0 && column.pk === 0 ? '?' : ''}`;
    }
    actual[table.name] = described;
  }
  const declared: Record<string, Record<string, string>> = {};
  for (const [table, columns] of Object.entries<Record<string, ColumnSpec>>(HQ_COLUMNS)) {
    const described: Record<string, string> = {};
    for (const [column, spec] of Object.entries(columns)) {
      described[column] = typeof spec === 'string' ? spec : `text${spec.nullable ? '?' : ''}`;
    }
    declared[table] = described;
  }

  expect(declared).toStrictEqual(actual);
});
