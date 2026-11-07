import type { ColumnSpec } from '../db/hq-columns.ts';

export function collectDeclaredEnums(tables: Readonly<Record<string, Readonly<Record<string, ColumnSpec>>>>): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(tables).flatMap(([table, columns]) =>
      Object.entries(columns).flatMap(([column, spec]) => (typeof spec === 'string' ? [] : [[`${table}.${column}`, spec.values] as const])),
    ),
  );
}
