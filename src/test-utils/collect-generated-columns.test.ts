import { expect, test } from 'bun:test';
import { collectGeneratedColumns } from './collect-generated-columns.ts';

test('it lists the generated columns by table and column, and skips the rest', () => {
  const columns = collectGeneratedColumns({
    notes: { id: 'generated', title: 'text', rank: 'integer' },
    tags: { name: 'text' },
    marks: { seq: 'generated' },
  });

  expect(columns).toStrictEqual(['notes.id', 'marks.seq']);
});
