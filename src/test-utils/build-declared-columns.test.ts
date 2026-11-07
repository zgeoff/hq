import { expect, test } from 'bun:test';
import { buildDeclaredColumns } from './build-declared-columns.ts';

test('it describes a plain column by its spec, a generated column as an integer, and a union column as text', () => {
  const described = buildDeclaredColumns({
    notes: { id: 'generated', rank: 'integer', body: 'text?', state: { values: ['open', 'done'], nullable: false }, tag: { values: ['a'], nullable: true } },
  });

  expect(described).toStrictEqual({ notes: { id: 'integer', rank: 'integer', body: 'text?', state: 'text', tag: 'text?' } });
});
