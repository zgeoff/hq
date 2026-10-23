import { expect, test } from 'bun:test';
import { buildStubMoveFacts } from './build-stub-move-facts.ts';

test('it holds the blobs and renames it is given', () => {
  const facts = buildStubMoveFacts({ base: [['a.md', 'aaa']], head: [['b.md', null]], renames: ['a.md\0b.md'] });

  expect(facts.baseBlobs.get('a.md')).toBe('aaa');
  expect(facts.headBlobs.get('b.md')).toBeNull();
  expect(facts.renames.has('a.md\0b.md')).toBe(true);
});

test('it is empty when given nothing', () => {
  const facts = buildStubMoveFacts({});

  expect(facts.baseBlobs.size).toBe(0);
  expect(facts.headBlobs.size).toBe(0);
  expect(facts.renames.size).toBe(0);
});
