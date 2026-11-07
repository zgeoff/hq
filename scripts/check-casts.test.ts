import { expect, test } from 'bun:test';
import { collectCounts, formatCounts } from './check-casts.ts';

const cast = { code: 'typescript(consistent-type-assertions)' };

test('it counts nothing when oxlint reports nothing', () => {
  expect(collectCounts([], [])).toStrictEqual({
    casts: 0,
    unsafe: 0,
    unsafeByRule: { assignment: 0, 'member-access': 0, argument: 0, call: 0, return: 0 },
  });
});

test('it counts only cast diagnostics as casts', () => {
  const counts = collectCounts([cast, cast, { code: 'typescript(no-non-null-assertion)' }], []);

  expect(counts.casts).toBe(2);
  expect(counts.unsafe).toBe(0);
});

test('it counts each no-unsafe rule apart and sums them', () => {
  const typeAware = [
    { code: 'typescript(no-unsafe-assignment)' },
    { code: 'typescript(no-unsafe-assignment)' },
    { code: 'typescript(no-unsafe-member-access)' },
    { code: 'typescript(no-unsafe-argument)' },
    { code: 'typescript(no-unsafe-call)' },
    { code: 'typescript(no-unsafe-return)' },
    { code: 'typescript(no-unsafe-return)' },
  ];

  expect(collectCounts([], typeAware)).toStrictEqual({
    casts: 0,
    unsafe: 7,
    unsafeByRule: { assignment: 2, 'member-access': 1, argument: 1, call: 1, return: 2 },
  });
});

test('it ignores unrelated codes in both reports', () => {
  const unrelated = [{ code: 'zgeoff(test-shape)' }, { code: 'typescript(no-unsafe-type-assertion)' }];

  expect(collectCounts([cast, ...unrelated], [{ code: 'typescript(no-unsafe-call)' }, ...unrelated])).toStrictEqual({
    casts: 1,
    unsafe: 1,
    unsafeByRule: { assignment: 0, 'member-access': 0, argument: 0, call: 1, return: 0 },
  });
});

test('it formats one line per total with the rule breakdown', () => {
  const counts = collectCounts([cast], [{ code: 'typescript(no-unsafe-call)' }]);

  expect(formatCounts(counts)).toStrictEqual(['casts: 1', 'no-unsafe: 1 (assignment 0, member-access 0, argument 0, call 1, return 0)']);
});
