import { expect, test } from 'bun:test';
import { renderVersion } from './render-version.ts';

test('it names no commit for a run from source', () => {
  expect(renderVersion('1.2.3', 9, { commit: null, dirty: null })).toStrictEqual({ data: { version: '1.2.3', schema: 9, commit: null, dirty: null }, text: 'hq 1.2.3 (schema v9). The gadget lab is open.' });
});

test('it names the short commit a clean build came from', () => {
  expect(renderVersion('1.2.3', 9, { commit: '0123456789abcdef0123456789abcdef01234567', dirty: false }).text).toBe('hq 1.2.3 (schema v9, built from 0123456). The gadget lab is open.');
});

test('it says when the build held uncommitted changes', () => {
  expect(renderVersion('1.2.3', 9, { commit: '0123456789abcdef0123456789abcdef01234567', dirty: true })).toStrictEqual({ data: { version: '1.2.3', schema: 9, commit: '0123456789abcdef0123456789abcdef01234567', dirty: true }, text: 'hq 1.2.3 (schema v9, built from 0123456 with uncommitted changes). The gadget lab is open.' });
});
