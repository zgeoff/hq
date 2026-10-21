import { expect, test } from 'bun:test';
import { keepCompared } from './keep-compared.ts';

test('it keeps the answers for merges still waiting and drops the rest', () => {
  const compared = new Map([
    [`tools:${'a'.repeat(40)}:kettle@1.2.0`, true],
    [`tools:${'a'.repeat(40)}:kettle@1.1.0`, false],
    [`tools:${'b'.repeat(40)}:kettle@1.2.0`, true],
  ]);

  const kept = keepCompared(compared, new Set(['a'.repeat(40)]));

  expect(kept).toStrictEqual({ [`tools:${'a'.repeat(40)}:kettle@1.2.0`]: true, [`tools:${'a'.repeat(40)}:kettle@1.1.0`]: false });
});

test('it keeps nothing when no merge waits', () => {
  const kept = keepCompared(new Map([[`tools:${'a'.repeat(40)}:kettle@1.2.0`, true]]), new Set());

  expect(kept).toStrictEqual({});
});
