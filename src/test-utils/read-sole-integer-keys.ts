import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const columnsSchema = z.array(z.object({ name: z.string(), type: z.string(), pk: z.number() }));

// Of the given table.column names, the ones that are the only primary key of their table and an INTEGER.
export function readSoleIntegerKeys(db: Database, columns: readonly string[]): string[] {
  return columns.filter((key) => {
    const [table = '', column = ''] = key.split('.');
    const keys = columnsSchema.parse(db.query('SELECT name, type, pk FROM pragma_table_info(?)').all(table)).filter((info) => info.pk > 0);
    return keys.length === 1 && keys[0]?.name === column && keys[0].type === 'INTEGER';
  });
}
