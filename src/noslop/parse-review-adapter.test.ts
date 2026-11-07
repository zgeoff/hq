import { expect, test } from 'bun:test';
import { parseReviewAdapter } from './parse-review-adapter.ts';

test.each([
  ['codex', 'codex'],
  ['claude', 'claude'],
  [undefined, undefined],
] as const)('it reads --adapter %p as %p', (value, adapter) => {
  expect(parseReviewAdapter(value)).toBe(adapter);
});

test.each([['claud'], ['']])('it refuses --adapter %p', (value) => {
  expect(() => parseReviewAdapter(value)).toThrow(expect.objectContaining({ code: 'bad_args', message: `--adapter must be codex or claude, not "${value}"` }));
});
