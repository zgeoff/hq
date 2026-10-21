import { expect, test } from 'bun:test';
import { formatAskStu } from './format-ask-stu.ts';

test('Ask Stu copies the id and title', () => {
  expect(formatAskStu({ id: 'kettle-mint', title: 'Mint the kettle tokens' })).toBe('hey stu, I want to chat about kettle-mint (Mint the kettle tokens)');
});
