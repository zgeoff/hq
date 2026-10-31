import { expect, test } from 'bun:test';
import { collectFencedLines } from './collect-fenced-lines.ts';

test('it marks each fence line and the lines between them', () => {
  expect(collectFencedLines(['Boil.', '```', '## lid', '```', 'Pour.'])).toStrictEqual([false, true, true, true, false]);
});

test('it keeps a four-backtick fence open across a three-backtick example inside it', () => {
  expect(collectFencedLines(['````md', '```', '## lid', '```', '````', '## Scope'])).toStrictEqual([true, true, true, true, true, false]);
});

test('it runs a fence that never closes to the end of the text', () => {
  expect(collectFencedLines(['~~~', '## lid', '```'])).toStrictEqual([true, true, true]);
});
