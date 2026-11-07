import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const tableSchema = z.array(z.object({ name: z.string() }));
const columnSchema = z.array(z.object({ name: z.string(), described: z.string() }));

export function readDescribedColumns(db: Database): Record<string, Record<string, string>> {
  const tables = tableSchema.parse(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all());
  return Object.fromEntries(
    tables.map((table) => {
      const columns = columnSchema.parse(
        db.query(`SELECT name, lower(type) || CASE WHEN "notnull" = 0 AND pk = 0 THEN '?' ELSE '' END AS described FROM pragma_table_info(?) ORDER BY cid`).all(table.name),
      );
      return [table.name, Object.fromEntries(columns.map((column) => [column.name, column.described]))];
    }),
  );
}
