import { expect, test } from 'bun:test';
import { buildMockNewTyped } from './build-mock-new-typed.ts';

test('it builds a default typed message from a console answer', () => {
  expect(buildMockNewTyped()).toStrictEqual({ to: 'z-invented', toId: null, toName: null, text: 'Descale it.', source: { kind: 'console', ref: 'descale-kettle', at: null }, actor: 'z-stu' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockNewTyped({ text: 'Hinge it.', actor: 'z-delivery' })).toStrictEqual({ to: 'z-invented', toId: null, toName: null, text: 'Hinge it.', source: { kind: 'console', ref: 'descale-kettle', at: null }, actor: 'z-delivery' });
});
