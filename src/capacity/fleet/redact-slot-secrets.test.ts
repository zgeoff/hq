import { expect, test } from 'bun:test';
import { redactSlotSecrets } from './redact-slot-secrets.ts';

test('it takes each given secret out of a message, even one no token pattern knows', () => {
  expect(redactSlotSecrets('fetch to kettle failed with tea7 and pot9 in the url', ['tea7', 'pot9'])).toBe('fetch to kettle failed with [redacted] and [redacted] in the url');
});

test('it still masks a token of a known family that was not given', () => {
  expect(redactSlotSecrets('refused sk-ant-kettle-slot-0042', [])).toBe('refused [redacted]');
});
