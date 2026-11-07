import type { ColumnSpec } from '../db/hq-columns.ts';

export function buildDeclaredColumns(tables: Readonly<Record<string, Readonly<Record<string, ColumnSpec>>>>): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(tables).map(([table, columns]) => [
      table,
      Object.fromEntries(Object.entries(columns).map(([column, spec]) => [column, typeof spec === 'string' ? spec : `text${spec.nullable ? '?' : ''}`])),
    ]),
  );
}
