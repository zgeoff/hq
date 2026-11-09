import { expect, test } from 'bun:test';
import { buildMockGrantActionInput } from './build-mock-grant-action-input.ts';

test('it builds a default grant action', () => {
  expect(buildMockGrantActionInput()).toStrictEqual({ grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockGrantActionInput({ target: 'kettle#8', note: 'on green' })).toStrictEqual({ grant: 'kettle-merges', target: 'kettle#8', note: 'on green', actor: 'teapot-bot' });
});
