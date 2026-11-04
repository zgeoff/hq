import { expect, test } from 'bun:test';
import { collectGuardedSessions } from './collect-guarded-sessions.ts';

test('it collects every listed run session, active or not, and every sub-session under them', () => {
  const guarded = collectGuardedSessions(
    [
      { issue: 'GEO-9932', session_id: '0000b001', active: 1 },
      { issue: 'GEO-9932', session_id: '0000b002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0 },
    ],
    [
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000b002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done', parent: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { id: '0000b004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'running', parent: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { id: '0000b005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'running' },
    ],
  );

  expect(guarded).toStrictEqual([
    { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
    { id: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done', parent: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { id: '0000b004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'running', parent: '0000b003-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { id: '0000b002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
  ]);
});

test('it returns null when atc does not list an active run session', () => {
  const guarded = collectGuardedSessions([{ issue: 'GEO-9932', session_id: '0000b001', active: 1 }], [{ id: '0000b005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }]);

  expect(guarded).toBeNull();
});

test('it skips an inactive run session that atc no longer lists', () => {
  const guarded = collectGuardedSessions(
    [
      { issue: 'GEO-9932', session_id: '0000b001', active: 1 },
      { issue: 'GEO-9932', session_id: '0000b002', active: 0 },
    ],
    [{ id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }],
  );

  expect(guarded).toStrictEqual([{ id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }]);
});
