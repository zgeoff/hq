import { expect, test } from 'bun:test';
import { buildDeclaredColumns } from './build-declared-columns.ts';

test('it describes a plain column by its spec and a union column as text', () => {
  const described = buildDeclaredColumns({
    notes: { id: 'integer', body: 'text?', state: { values: ['open', 'done'], nullable: false }, tag: { values: ['a'], nullable: true } },
  });

  expect(described).toStrictEqual({ notes: { id: 'integer', body: 'text?', state: 'text', tag: 'text?' } });
});
