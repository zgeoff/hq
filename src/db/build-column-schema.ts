import { z } from 'zod';
import type { ColumnSpec } from './hq-columns.ts';

export function buildColumnSchema(spec: ColumnSpec): z.ZodType {
  if (typeof spec !== 'string') {
    const values = z.enum(spec.values);
    return spec.nullable ? values.nullable() : values;
  }
  const base = spec.startsWith('text') ? z.string() : z.number();
  return spec.endsWith('?') ? base.nullable() : base;
}
