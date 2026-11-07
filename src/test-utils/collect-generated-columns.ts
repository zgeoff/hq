import type { ColumnSpec } from '../db/hq-columns.ts';

export function collectGeneratedColumns(tables: Readonly<Record<string, Readonly<Record<string, ColumnSpec>>>>): string[] {
  return Object.entries(tables).flatMap(([table, columns]) =>
    Object.entries(columns)
      .filter(([, spec]) => spec === 'generated')
      .map(([column]) => `${table}.${column}`),
  );
}
