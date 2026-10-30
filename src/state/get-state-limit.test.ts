import { expect, test } from 'bun:test';
import { getStateLimit } from './get-state-limit.ts';

test('#getStateLimit a role gets the 16 KB default', () => {
  expect(getStateLimit('kettle')).toBe(16_384);
});

test('#getStateLimit delivery gets 15 KB', () => {
  expect(getStateLimit('delivery')).toBe(15_360);
});
