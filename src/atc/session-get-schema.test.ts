import { expect, test } from 'bun:test';
import { sessionGetSchema } from './session-get-schema.ts';

test('it reads the pending message of a session.get answer', () => {
  const result = sessionGetSchema.safeParse({ lastActivityAt: 1_700_000_000_000, prompt: null, pending: { message: 'Claude is waiting for your input', kind: 'notice' } });

  expect(result.data).toStrictEqual({ lastActivityAt: 1_700_000_000_000, prompt: null, pending: { message: 'Claude is waiting for your input', kind: 'notice' } });
});

test.each([
  ['a missing pending', {}, undefined],
  ['a null pending', { pending: null }, null],
  ['a pending with no message', { pending: { menu: ['yes', 'no'] } }, { menu: ['yes', 'no'] }],
])('it reads a session.get answer with %s', (_name, extra, pending) => {
  const result = sessionGetSchema.safeParse({ lastActivityAt: 1_700_000_000_000, prompt: 'Boil the kettle.', ...extra });

  expect(result.data).toStrictEqual({ lastActivityAt: 1_700_000_000_000, prompt: 'Boil the kettle.', ...(pending === undefined ? {} : { pending }) });
});

test.each([
  ['a pending that is not an object', { pending: 'waiting' }, undefined],
  ['a pending message that is not a string', { pending: { message: 7 } }, { message: undefined }],
])('it reads %s as no message', (_name, extra, pending) => {
  const result = sessionGetSchema.safeParse({ lastActivityAt: 1_700_000_000_000, prompt: 'Boil the kettle.', ...extra });

  expect(result.data?.pending).toStrictEqual(pending);
});
