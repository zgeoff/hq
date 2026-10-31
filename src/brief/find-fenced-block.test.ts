import { expect, test } from 'bun:test';
import { findFencedBlock } from './find-fenced-block.ts';

test('it gives the body of the first text fence, without the fences', () => {
  expect(findFencedBlock('<!-- c -->\n\n```text\nline one\n\nline two\n```\n\n```text\nlater\n```\n', null)).toBe('line one\n\nline two');
});

test('it gives the first fence after the marker', () => {
  const text = 'The stack line:\n\n```text\nstack\n```\n\nThe imp line:\n\n```text\nimp\n```\n';

  expect(findFencedBlock(text, 'The imp line:')).toBe('imp');
});

test('it gives null when the marker is missing, or no fence follows it', () => {
  expect(findFencedBlock('```text\nx\n```\n', 'The imp line:')).toBeNull();
  expect(findFencedBlock('The imp line:\n\nnothing\n', 'The imp line:')).toBeNull();
});
