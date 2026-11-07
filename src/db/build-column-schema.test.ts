import { expect, test } from 'bun:test';
import { buildColumnSchema } from './build-column-schema.ts';
import type { ColumnSpec } from './hq-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

test.each(
  Object.entries(HQ_COLUMNS).flatMap(([table, columns]) =>
    Object.entries(columns).map(([column, spec]: [string, ColumnSpec]) => ({ table, column, spec, nullable: typeof spec === 'string' ? spec.endsWith('?') : spec.nullable })),
  ),
)('it builds $table.$column to accept null exactly when its spec is nullable ($nullable)', (testCase) => {
  expect(buildColumnSchema(testCase.spec).safeParse(null).success).toBe(testCase.nullable);
});

test.each(
  Object.entries(HQ_COLUMNS).flatMap(([table, columns]) =>
    Object.entries(columns).flatMap(([column, spec]: [string, ColumnSpec]) => (spec === 'integer' || spec === 'integer?' || spec === 'real' || spec === 'real?' || spec === 'generated' ? [{ table, column, spec }] : [])),
  ),
)('it builds the $spec column $table.$column to accept a number and refuse a string', (testCase) => {
  const schema = buildColumnSchema(testCase.spec);

  expect([schema.safeParse(3).success, schema.safeParse(1.5).success, schema.safeParse('3').success]).toStrictEqual([true, true, false]);
});

test.each(
  Object.entries(HQ_COLUMNS).flatMap(([table, columns]) =>
    Object.entries(columns).flatMap(([column, spec]: [string, ColumnSpec]) => (typeof spec === 'string' ? [] : [{ table, column, spec }])),
  ),
)('it builds the enum column $table.$column to accept each listed value and refuse an unlisted one', (testCase) => {
  const schema = buildColumnSchema(testCase.spec);

  expect(testCase.spec.values.filter((value) => !schema.safeParse(value).success)).toStrictEqual([]);
  expect(schema.safeParse('an-unlisted-value').success).toBe(false);
});

test.each(
  Object.entries(HQ_COLUMNS).flatMap(([table, columns]) =>
    Object.entries(columns).flatMap(([column, spec]: [string, ColumnSpec]) => (spec === 'text' || spec === 'text?' ? [{ table, column, spec }] : [])),
  ),
)('it builds the $spec column $table.$column to accept a string and refuse a number', (testCase) => {
  const schema = buildColumnSchema(testCase.spec);

  expect([schema.safeParse('a string').success, schema.safeParse(3).success]).toStrictEqual([true, false]);
});
