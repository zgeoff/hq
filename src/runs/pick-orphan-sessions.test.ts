import { expect, test } from 'bun:test';
import { pickOrphanSessions } from './pick-orphan-sessions.ts';

test.each([
  ['kept 23h59m ago', '2026-11-06T03:01:00Z', []],
  ['kept exactly 24h ago', '2026-11-06T03:00:00Z', ['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
  ['kept 25h ago', '2026-11-06T02:00:00Z', ['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
])('it picks an exited session of a closed run %s only from a day on', (_name, keptAt, expected) => {
  const picked = pickOrphanSessions({
    sessions: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }],
    fleetNames: new Set(),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, open: false, ownerChats: false }],
    lastKeptMs: new Map([['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse(keptAt)]]),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked.map((orphan) => orphan.session.id)).toStrictEqual(expected);
});

test('it picks an exited session of a closed run with the newest run that recorded it', () => {
  const picked = pickOrphanSessions({
    sessions: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }],
    fleetNames: new Set(),
    runSessions: [
      { sessionID: '0000f001', issue: 'GEO-601', active: false, open: false, ownerChats: false },
      { sessionID: '0000f001', issue: 'GEO-603', active: false, open: false, ownerChats: false },
    ],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked).toStrictEqual([{ session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-603' }]);
});

test.each([
  ['on a closed run the owner chats on', { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }],
  ['whose parent is on a run the owner chats on', { id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
])('it never picks an exited session %s', (_name, session) => {
  const picked = pickOrphanSessions({
    sessions: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, session],
    fleetNames: new Set(),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, open: false, ownerChats: true }],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked).toStrictEqual([]);
});
