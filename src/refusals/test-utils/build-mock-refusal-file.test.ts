import { expect, test } from 'bun:test';
import { buildMockRefusalFile } from './build-mock-refusal-file.ts';

test('it builds a default scanned transcript', () => {
  expect(buildMockRefusalFile()).toStrictEqual({ path: '/t.jsonl', offset: 5, size: 9, mtime: '2026-10-14T03:00:00Z', tools: '[]' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockRefusalFile({ path: '/u.jsonl', size: 40 })).toStrictEqual({ path: '/u.jsonl', offset: 5, size: 40, mtime: '2026-10-14T03:00:00Z', tools: '[]' });
});
