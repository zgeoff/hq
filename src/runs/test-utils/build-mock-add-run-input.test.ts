import { expect, test } from 'bun:test';
import { buildMockAddRunInput } from './build-mock-add-run-input.ts';

test('it builds a default add-run input', () => {
  expect(buildMockAddRunInput()).toStrictEqual({ issue: 'GEO-9001', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'delivery-bot' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockAddRunInput({ issue: 'GEO-9002', place: 'local' })).toStrictEqual({ issue: 'GEO-9002', title: 'Invented kettle work', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'delivery-bot' });
});
