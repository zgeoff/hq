import { expect, test } from 'bun:test';
import { formatWrapUp } from './format-wrap-up.ts';

test('it tells what the wrap-up did in the past tense', () => {
  const text = formatWrapUp({
    forgotten: ['0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    destroyed: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    kept: [{ id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }],
    failed: [{ id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'the kettle lid stuck' }],
  });

  expect(text).toBe('Wrap-up: forgot 0000a002, 0000a001; destroyed the imp of 0000a001; kept 0000b001 (pinned in atc); failed 0000c001 (the kettle lid stuck).');
});

test('it tells what a dry run would do', () => {
  const text = formatWrapUp(
    {
      forgotten: ['0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      destroyed: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      kept: [{ id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }],
      failed: [{ id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'the kettle lid stuck' }],
    },
    'planned',
  );

  expect(text).toBe('Wrap-up: would forget 0000a002, 0000a001; would destroy the imp of 0000a001; would keep 0000b001 (pinned in atc); would fail 0000c001 (the kettle lid stuck).');
});

test('it says no session of the run is in atc when the wrap-up touched none', () => {
  expect(formatWrapUp({ forgotten: [], destroyed: [], kept: [], failed: [] }, 'planned')).toBe('Wrap-up: no session of the run is in atc.');
});
