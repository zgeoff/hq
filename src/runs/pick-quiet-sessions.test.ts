import { expect, test } from 'bun:test';
import { pickQuietSessions } from './pick-quiet-sessions.ts';

test('it returns the ids of a tree that is all done and quiet', () => {
  const checked = pickQuietSessions(
    [
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done', parent: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
    new Map([
      ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:30:00Z')],
    ]),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(checked).toStrictEqual(['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});

test.each([
  ['a running session', 'running', Date.parse('2026-10-22T11:00:00Z')],
  ['a session active inside the quiet time', 'done', Date.parse('2026-10-22T11:31:00Z')],
  ['a session with no activity reading', 'done', null],
])('it returns null for a tree with %s', (_name, state, lastMs) => {
  const checked = pickQuietSessions(
    [
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state, parent: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
    new Map([
      ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastMs],
    ]),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(checked).toBeNull();
});

test('it returns null for a run whose sessions could not all be found', () => {
  const checked = pickQuietSessions(null, new Map(), Date.parse('2026-10-22T11:30:00Z'));

  expect(checked).toBeNull();
});
