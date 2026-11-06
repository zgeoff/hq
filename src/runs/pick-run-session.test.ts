import { expect, test } from 'bun:test';
import { pickRunSession } from './pick-run-session.ts';

test.each([
  { title: 'a prefix of a stored full id', stored: ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000b002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], given: '0000b002', expected: '0000b002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  { title: 'a prefix in capitals', stored: ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], given: '0000B001', expected: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  { title: 'a full id for a stored prefix', stored: ['0000b001'], given: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expected: '0000b001' },
  { title: 'an id no session starts with', stored: ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], given: '0000b009', expected: null },
  { title: 'a prefix two sessions share', stored: ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000b002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], given: '0000b00', expected: null },
])('it picks $expected for $title', (row) => {
  expect(pickRunSession(row.stored, row.given)).toBe(row.expected);
});
