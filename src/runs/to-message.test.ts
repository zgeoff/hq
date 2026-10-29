import { expect, test } from 'bun:test';
import { toMessage } from './to-message.ts';

test('it reads the message of an error', () => {
  expect(toMessage(new Error('the kettle boiled dry'))).toBe('the kettle boiled dry');
});

test('it turns a thrown value that is not an error into text', () => {
  expect(toMessage('the teapot cracked')).toBe('the teapot cracked');
});
