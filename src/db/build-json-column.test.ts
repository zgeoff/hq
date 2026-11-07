import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildJSONColumn } from './build-json-column.ts';

test('it parses stored JSON text through the inner schema', () => {
  const column = buildJSONColumn(z.array(z.string()));

  expect(column.parse('["GEO-1","GEO-2"]')).toStrictEqual(['GEO-1', 'GEO-2']);
});

test.each([
  { name: 'text that is not JSON', text: '{oops' },
  { name: 'JSON of the wrong shape', text: '{"a":1}' },
  { name: 'an empty string', text: '' },
])('it fails $name as a schema issue', ({ text }) => {
  const result = buildJSONColumn(z.array(z.string())).safeParse(text);

  expect(result.success).toBe(false);
});

test('it fails a value that is not text', () => {
  expect(buildJSONColumn(z.array(z.string())).safeParse(['GEO-1']).success).toBe(false);
});
