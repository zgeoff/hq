import { expect, test } from 'bun:test';
import { collectDeclaredEnums } from './collect-declared-enums.ts';

test('it keys the values of each union column by table and column, and skips plain columns', () => {
  const enums = collectDeclaredEnums({
    notes: { id: 'integer', body: 'text?', state: { values: ['open', 'done'], nullable: false } },
    tags: { name: 'text', tone: { values: ['warm'], nullable: true } },
  });

  expect(enums).toStrictEqual({ 'notes.state': ['open', 'done'], 'tags.tone': ['warm'] });
});
