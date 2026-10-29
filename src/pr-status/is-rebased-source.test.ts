import { expect, test } from 'bun:test';
import { isAnswerSource } from './is-answer-source.ts';
import { isRebasedSource } from './is-rebased-source.ts';

test('it takes rebased: followed by a full sha', () => {
  expect(isRebasedSource(`rebased:${'ab12'.repeat(10)}`)).toBe(true);
});

test.each(['rebased:abc1234', 'rebased:', `rebased:${'AB12'.repeat(10)}`, 'chat:kettle-1'])('it refuses %p', (source) => {
  expect(isRebasedSource(source)).toBe(false);
});

test('it is not an answer source, so a session cannot type it', () => {
  expect(isAnswerSource(`rebased:${'ab12'.repeat(10)}`)).toBe(false);
});
