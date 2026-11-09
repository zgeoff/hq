import { expect, test } from 'bun:test';
import { buildMockGrantMarkInput } from './build-mock-grant-mark-input.ts';

test('it builds a default named grant', () => {
  expect(buildMockGrantMarkInput()).toStrictEqual({ text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockGrantMarkInput({ name: 'teapot-merges', ref: 'kettle#3' })).toStrictEqual({ text: 'kettle PRs merge on green CI', ref: 'kettle#3', at: null, name: 'teapot-merges', actor: 'kettle-bot' });
});
