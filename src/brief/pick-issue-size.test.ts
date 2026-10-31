import { expect, test } from 'bun:test';
import { pickIssueSize } from './pick-issue-size.ts';

test.each(['S', 'M', 'L', 'XL'] as const)('it picks the %s label of the Size group', (size) => {
  expect(pickIssueSize([{ name: 'hq', parent: null }, { name: size, parent: { name: 'Size' } }])).toBe(size);
});

test('it picks nothing for an issue with no Size-group label, or a Size-group label that is no size', () => {
  expect(pickIssueSize([{ name: 'L' }])).toBeNull();
  expect(pickIssueSize([{ name: 'huge', parent: { name: 'Size' } }])).toBeNull();
});
