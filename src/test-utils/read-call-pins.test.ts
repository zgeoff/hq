import { expect, test } from 'bun:test';
import { readCallPins } from './read-call-pins.ts';

test('it reads each call method with its pinned flag, undefined where the input has none', () => {
  const calls = [
    { method: 'session.kill', input: { session: 'id-kettle' } },
    { method: 'session.update', input: { session: 'id-kettle', pinned: false } },
    { method: 'session.update', input: { session: 'id-teapot', pinned: true } },
  ];

  expect(readCallPins({ calls })).toStrictEqual([
    ['session.kill', undefined],
    ['session.update', false],
    ['session.update', true],
  ]);
});

test('it throws on a call whose pinned flag is not a boolean', () => {
  const calls = [{ method: 'session.update', input: { pinned: 'yes' } }];

  expect(() => readCallPins({ calls })).toThrow(/pinned/u);
});
