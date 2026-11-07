import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const tableSchema = z.object({ sql: z.string() });
export function readCheckedValues(db: Database, columns: readonly string[]): Record<string, readonly string[]> {
  return Object.fromEntries(
    columns.map((key) => {
      const [table = '', column = ''] = key.split('.');
      const row = tableSchema.parse(db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
      const list = new RegExp(`CHECK \\(${column} IN \\((?<list>[^)]*)\\)\\)`, 'u').exec(row.sql)?.groups?.['list'] ?? '';
      return [key, parseValueList(list)];
    }),
  );
}

const QUOTED = /^'(?<value>.*)'$/u;

function parseValueList(list: string): string[] {
  return list
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) => QUOTED.exec(item)?.groups?.['value'] ?? item);
}
