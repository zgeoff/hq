import { expect, test } from 'bun:test';
import { pickMergedRetry } from './pick-merged-retry.ts';

test.each([
  ['599 999 ms after the merge', { mergedAtMs: 1_000_000, nowMs: 1_599_999, retries: 0, claimOpen: false, kept: [{ id: 'kettle-1', retry: true as const }] }, ['kettle-1']],
  ['600 000 ms after the merge', { mergedAtMs: 1_000_000, nowMs: 1_600_000, retries: 0, claimOpen: false, kept: [{ id: 'kettle-1', retry: true as const }] }, null],
  ['1 retry taken', { mergedAtMs: 1_000_000, nowMs: 1_060_000, retries: 1, claimOpen: false, kept: [{ id: 'kettle-1', retry: true as const }] }, ['kettle-1']],
  ['2 retries taken', { mergedAtMs: 1_000_000, nowMs: 1_060_000, retries: 2, claimOpen: false, kept: [{ id: 'kettle-1', retry: true as const }] }, null],
  ['an open claim', { mergedAtMs: 1_000_000, nowMs: 1_060_000, retries: 0, claimOpen: true, kept: [{ id: 'kettle-1', retry: true as const }] }, null],
  ['no retry-marked session', { mergedAtMs: 1_000_000, nowMs: 1_060_000, retries: 0, claimOpen: false, kept: [{ id: 'kettle-1' }] }, null],
  ['one retry-marked session of two', { mergedAtMs: 1_000_000, nowMs: 1_060_000, retries: 0, claimOpen: false, kept: [{ id: 'kettle-1' }, { id: 'kettle-2', retry: true as const }] }, ['kettle-2']],
  ['no merge time', { mergedAtMs: null, nowMs: 1_060_000, retries: 0, claimOpen: false, kept: [{ id: 'kettle-1', retry: true as const }] }, null],
  ['an unreadable merge time', { mergedAtMs: Number.NaN, nowMs: 1_060_000, retries: 0, claimOpen: false, kept: [{ id: 'kettle-1', retry: true as const }] }, null],
])('it picks the retry for %s', (_name, facts, expected) => {
  expect(pickMergedRetry(facts)).toStrictEqual(expected);
});
