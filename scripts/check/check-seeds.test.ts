import { expect, test } from 'bun:test';
import { checkSeeds, collectSeedCounts, formatSeedCounts } from './check-seeds.ts';

test('#checkSeeds returns 0 when no seed rule has a finding', () => {
  expect(checkSeeds([{ code: 'zgeoff(test-shape)' }])).toBe(0);
});

test.each(['seed-only', 'function-verb', 'test-beside-seed'])('#checkSeeds returns 1 when %s has a finding', (rule) => {
  expect(checkSeeds([{ code: `zgeoff(${rule})` }])).toBe(1);
});

test('#collectSeedCounts counts nothing when oxlint reports nothing', () => {
  expect(collectSeedCounts([])).toStrictEqual({ 'seed-only': 0, 'function-verb': 0, 'test-beside-seed': 0 });
});

test('#collectSeedCounts counts each seed rule apart and ignores other codes', () => {
  const rows = [
    { code: 'zgeoff(seed-only)' },
    { code: 'zgeoff(seed-only)' },
    { code: 'zgeoff(function-verb)' },
    { code: 'zgeoff(test-beside-seed)' },
    { code: 'zgeoff(test-shape)' },
    { code: 'typescript(consistent-type-assertions)' },
  ];

  expect(collectSeedCounts(rows)).toStrictEqual({ 'seed-only': 2, 'function-verb': 1, 'test-beside-seed': 1 });
});

test('#formatSeedCounts names each seed rule with its count', () => {
  expect(formatSeedCounts({ 'seed-only': 2, 'function-verb': 0, 'test-beside-seed': 1 })).toBe('seed rules: seed-only 2, function-verb 0, test-beside-seed 1');
});
