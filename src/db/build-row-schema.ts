import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { ColumnSpec } from './hq-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';
import { buildColumnSchema } from './build-column-schema.ts';

export type TableName = keyof typeof HQ_COLUMNS;

export function buildRowSchema<Table extends TableName>(table: Table) {
  const columns: Readonly<Record<string, ColumnSpec>> = HQ_COLUMNS[table];
  const shape = Object.fromEntries(Object.entries(columns).map(([name, spec]) => [name, buildColumnSchema(spec)]));
  invariant(isRowShape<(typeof HQ_COLUMNS)[Table]>(shape, columns), 'every column has a schema that matches its spec');
  return z.object(shape);
}

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

// Object.fromEntries cannot keep one schema type per column, so this guard states the shape the
// mapped types promise, and checks each column's schema against its spec.
function isRowShape<Columns>(shape: Record<string, z.ZodType>, columns: Readonly<Record<string, ColumnSpec>>): shape is RowShape<Columns> {
  return Object.entries(columns).every(([name, spec]) => {
    const schema = shape[name];
    return schema !== undefined && isColumnSchema(schema, spec);
  });
}

function isColumnSchema(schema: z.ZodType, spec: ColumnSpec): boolean {
  const nullable = typeof spec === 'string' ? spec.endsWith('?') : spec.nullable;
  if (nullable !== schema instanceof z.ZodNullable) {
    return false;
  }
  const inner = schema instanceof z.ZodNullable ? schema.unwrap() : schema;
  if (typeof spec !== 'string') {
    return inner instanceof z.ZodEnum && inner.options.length === spec.values.length && spec.values.every((value) => inner.options.includes(value));
  }
  return spec.startsWith('text') ? inner instanceof z.ZodString : inner instanceof z.ZodNumber;
}
