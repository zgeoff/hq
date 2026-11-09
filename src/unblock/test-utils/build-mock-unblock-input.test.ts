import { expect, test } from 'bun:test';
import { buildMockUnblockInput } from './build-mock-unblock-input.ts';

test('it builds a default unblock item with nothing waiting on it', () => {
  expect(buildMockUnblockInput()).toStrictEqual({ id: 'descale', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockUnblockInput({ id: 'kettle-release', kind: 'watch' })).toStrictEqual({ id: 'kettle-release', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage', kind: 'watch' });
});
