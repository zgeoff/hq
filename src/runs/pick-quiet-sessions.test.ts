import { expect, test } from 'bun:test';
import { pickQuietSessions } from './pick-quiet-sessions.ts';

test('it returns the ids of a tree that is all done and quiet', () => {
  const checked = pickQuietSessions(
    [
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done', parent: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
    new Map([
      ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { lastActivityAt: Date.parse('2026-10-22T11:00:00Z'), pendingMessage: null }],
      ['0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { lastActivityAt: Date.parse('2026-10-22T11:30:00Z'), pendingMessage: null }],
    ]),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(checked).toStrictEqual(['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});

test("it counts a needs_you session whose pending message is Claude's idle notice as quiet", () => {
  const checked = pickQuietSessions(
    [{ id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'needs_you' }],
    new Map([['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { lastActivityAt: Date.parse('2026-10-22T10:11:00Z'), pendingMessage: 'Claude is waiting for your input' }]]),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(checked).toStrictEqual(['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});

test.each([
  ['a running session', 'running', Date.parse('2026-10-22T11:00:00Z'), null],
  ['a session active inside the quiet time', 'done', Date.parse('2026-10-22T11:31:00Z'), null],
  ['a session with no activity reading', 'done', null, null],
  ['a needs_you session waiting on a permission prompt', 'needs_you', Date.parse('2026-10-22T11:00:00Z'), 'Claude needs your permission to use Bash'],
  ['a needs_you session with no pending message', 'needs_you', Date.parse('2026-10-22T11:00:00Z'), null],
  ['a running session whose pending message is the idle notice', 'running', Date.parse('2026-10-22T11:00:00Z'), 'Claude is waiting for your input'],
])('it returns null for a tree with %s', (_name, state, lastActivityAt, pendingMessage) => {
  const checked = pickQuietSessions(
    [
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state, parent: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
    new Map([
      ['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { lastActivityAt: Date.parse('2026-10-22T11:00:00Z'), pendingMessage: null }],
      ['0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { lastActivityAt, pendingMessage }],
    ]),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(checked).toBeNull();
});

test('it returns null for a session atc gave no reading for', () => {
  const checked = pickQuietSessions([{ id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], new Map([['0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null]]), Date.parse('2026-10-22T11:30:00Z'));

  expect(checked).toBeNull();
});

test('it returns null for a run whose sessions could not all be found', () => {
  const checked = pickQuietSessions(null, new Map(), Date.parse('2026-10-22T11:30:00Z'));

  expect(checked).toBeNull();
});
