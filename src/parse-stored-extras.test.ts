import { expect, test } from 'bun:test';
import { parseStoredExtras } from './parse-stored-extras.ts';

test('#parseStoredExtras returns null for no stored extras', () => {
  expect(parseStoredExtras(null)).toBeNull();
});

test('#parseStoredExtras reads the extras of an item', () => {
  const stored = JSON.stringify({ details: [{ heading: 'Evidence', text: 'The last boil took 9 min.' }], unblocks: [], links: [] });

  expect(parseStoredExtras(stored)).toStrictEqual({ details: [{ heading: 'Evidence', text: 'The last boil took 9 min.' }], unblocks: [], links: [] });
});

test('#parseStoredExtras rejects stored text that is not JSON', () => {
  expect(() => parseStoredExtras('not json')).toThrow();
});

test('#parseStoredExtras rejects extras of the wrong shape', () => {
  expect(() => parseStoredExtras(JSON.stringify({ details: 'none' }))).toThrow();
});
