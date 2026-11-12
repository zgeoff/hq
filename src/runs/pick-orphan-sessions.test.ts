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
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, endedBy: null, open: false, ownerChats: false }],
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
      { sessionID: '0000f001', issue: 'GEO-601', active: false, endedBy: null, open: false, ownerChats: false },
      { sessionID: '0000f001', issue: 'GEO-603', active: false, endedBy: null, open: false, ownerChats: false },
    ],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked).toStrictEqual([{ session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-603', place: 'local' }]);
});

test('it picks an exited session on an imp with the imp as its place', () => {
  const picked = pickOrphanSessions({
    sessions: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited', locator: { targetID: 'imp-kettle' } }],
    fleetNames: new Set(),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, endedBy: null, open: false, ownerChats: false }],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked.map((orphan) => orphan.place)).toStrictEqual(['imp']);
});

test.each([
  ['a pinned fleet session', { id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'stu', alive: true, state: 'done', pinned: true }],
  ['a pinned session of a closed run', { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited', pinned: true }],
])('it never picks an exited child of %s', (_name, parent) => {
  const picked = pickOrphanSessions({
    sessions: [parent, { id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: parent.id }],
    fleetNames: new Set(['stu']),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, endedBy: null, open: false, ownerChats: false }],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked).toStrictEqual([]);
});

test.each([
  ['on a closed run the owner chats on', { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }],
  ['whose parent is on a run the owner chats on', { id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
])('it never picks an exited session %s', (_name, session) => {
  const picked = pickOrphanSessions({
    sessions: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, session],
    fleetNames: new Set(),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, endedBy: null, open: false, ownerChats: true }],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked).toStrictEqual([]);
});

test.each<[string, { active: boolean; endedBy: string | null; open: boolean }, string[]]>([
  ['an asleep session the sweep ended on an open run', { active: false, endedBy: 'sweep', open: true }, ['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
  ['an asleep session of a closed run', { active: false, endedBy: 'sweep', open: false }, []],
  ['an asleep session the owner removed', { active: false, endedBy: null, open: true }, []],
  ['an asleep session still active on an open run', { active: true, endedBy: null, open: true }, []],
])('it picks %s only when the sweep ended it on an open run', (_name, row, expected) => {
  const picked = pickOrphanSessions({
    sessions: [
      { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } },
      { id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'idle', lifecycle: { vm: 'asleep' }, parent: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'stu', alive: true, state: 'idle' },
    ],
    fleetNames: new Set(['stu']),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', ...row, ownerChats: false }],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked.map((orphan) => orphan.session.id)).toStrictEqual(expected);
});

test.each<[string, string | null, string[]]>([
  ['the sweep ended the parent on an open run', 'sweep', ['0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
  ['the owner removed the parent', null, []],
])('it picks an unrecorded asleep child with its asleep parent only when %s', (_name, endedBy, expected) => {
  const picked = pickOrphanSessions({
    sessions: [
      { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } },
      { id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'idle', lifecycle: { vm: 'asleep' }, parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
    fleetNames: new Set(),
    runSessions: [{ sessionID: '0000f001', issue: 'GEO-601', active: false, endedBy, open: true, ownerChats: false }],
    lastKeptMs: new Map(),
    nowMs: Date.parse('2026-11-07T03:00:00Z'),
  });

  expect(picked.map((orphan) => orphan.session.id)).toStrictEqual(expected);
});
