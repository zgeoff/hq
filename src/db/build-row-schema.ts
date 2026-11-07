import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { ColumnSpec } from './hq-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

export type TableName = keyof typeof HQ_COLUMNS;

type ColumnSchema<Spec extends ColumnSpec> = Spec extends 'text'
  ? z.ZodString
  : Spec extends 'text?'
    ? z.ZodNullable<z.ZodString>
    : Spec extends 'integer' | 'real' | 'generated'
      ? z.ZodNumber
      : Spec extends 'integer?' | 'real?'
        ? z.ZodNullable<z.ZodNumber>
        : Spec extends { readonly values: infer Values extends readonly string[]; readonly nullable: false }
          ? z.ZodEnum<{ [Value in Values[number]]: Value }>
          : Spec extends { readonly values: infer Values extends readonly string[]; readonly nullable: true }
            ? z.ZodNullable<z.ZodEnum<{ [Value in Values[number]]: Value }>>
            : never;

type RowShape<Columns> = { -readonly [Column in keyof Columns]: Columns[Column] extends ColumnSpec ? ColumnSchema<Columns[Column]> : never };

export function buildRowSchema<Table extends TableName>(table: Table) {
  const columns = HQ_COLUMNS[table];
  const shape = Object.fromEntries(Object.entries(columns).map(([name, spec]) => [name, buildColumnSchema(spec)]));
  invariant(isRowShape<(typeof HQ_COLUMNS)[Table]>(shape, columns), 'every column has a schema');
  return z.object(shape);
}

function buildColumnSchema(spec: ColumnSpec): z.ZodType {
  if (typeof spec !== 'string') {
    const values = z.enum(spec.values);
    return spec.nullable ? values.nullable() : values;
  }
  const base = spec.startsWith('text') ? z.string() : z.number();
  return spec.endsWith('?') ? base.nullable() : base;
}

// Object.fromEntries cannot keep one schema type per column, so this guard states the shape the
// mapped types promise, and checks that it has a schema for every column.
function isRowShape<Columns>(shape: Record<string, z.ZodType>, columns: object): shape is RowShape<Columns> {
  return Object.keys(columns).every((name) => name in shape);
}
