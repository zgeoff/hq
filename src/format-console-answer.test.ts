import { expect, test } from 'bun:test';
import { formatConsoleAnswer } from './format-console-answer.ts';

test('it stores the label and note as z-stu set, the note verbatim', () => {
  expect(formatConsoleAnswer('Yes, mint them', '')).toBe('Yes, mint them');
  expect(formatConsoleAnswer('', '  Only on weekdays.\nNot Sundays. ')).toBe('  Only on weekdays.\nNot Sundays. ');
  expect(formatConsoleAnswer('Not yet', 'Ask again on Monday.')).toBe('Not yet | Ask again on Monday.');
  expect(formatConsoleAnswer('Not yet', '   ')).toBe('Not yet');
});

test('it refuses an answer with neither an option nor a note', () => {
  expect(() => formatConsoleAnswer('', ' ')).toThrow('pick an option or write a note');
});
