import { expect, test } from 'bun:test';
import { z } from 'zod';
import fixture from '../../test/fixtures/atc.json';
import { cursorIndex } from './cursor-index.ts';
import { FROM_START } from './from-start.ts';

// test/fixtures/atc.json comes from a running atc: bun scripts/atc-fixture.ts > test/fixtures/atc.json
test('it decodes the index of a cursor a real atc made', () => {
  const [, id] = z.tuple([z.literal('events'), z.number()]).parse(JSON.parse(fixture.cursorDecoded));

  expect(cursorIndex(fixture.cursor)).toBe(id);
});

test('it builds the start cursor in the same form a real atc makes', () => {
  const ours = JSON.parse(Buffer.from(FROM_START, 'base64url').toString()) as unknown[],
    real = JSON.parse(Buffer.from(fixture.cursor, 'base64url').toString()) as unknown[];

  expect([ours.length, ours[0]]).toStrictEqual([real.length, real[0]]);
  expect(cursorIndex(FROM_START)).toBe(0);
});

test('it reads a cursor in the keyed form of atc 5 as NaN', () => {
  const keyed = Buffer.from(JSON.stringify({ k: 'ev', i: 7 })).toString('base64url');

  expect(cursorIndex(keyed)).toBeNaN();
});

test('it reads a cursor that is not one as NaN', () => {
  expect(cursorIndex('not a cursor')).toBeNaN();
});
