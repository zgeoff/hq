import { expect, test } from 'bun:test';
import { parseAtcMcpProcess } from './parse-atc-mcp-process.ts';

test('it builds the process record with its session, start time and exe', () => {
  expect(
    parseAtcMcpProcess({
      pid: 55,
      cmdline: '/home/kettle/.local/bin/atc\0mcp\0',
      stat: '55 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 3670016 448',
      exe: '/home/kettle/.local/bin/atc (deleted)',
      cgroup: '0::/user.slice/atc-daemon-session-deadbeef-1a2b3c4d-1111-2222-3333-444455556666-cafef00d.scope\n',
      btime: 1000,
    }),
  ).toStrictEqual({ pid: 55, sessionID: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_002_500, exe: '/home/kettle/.local/bin/atc (deleted)' });
});

test('it counts the start time from the last paren when the command name holds spaces and parens', () => {
  expect(
    parseAtcMcpProcess({
      pid: 55,
      cmdline: 'atc\0mcp\0',
      stat: '55 (a) t(c) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 3670016 448',
      exe: '/opt/kettle/atc',
      cgroup: '0::/user.slice/other.scope\n',
      btime: 1000,
    }),
  ).toStrictEqual({ pid: 55, sessionID: null, startedAtMs: 1_002_500, exe: '/opt/kettle/atc' });
});

test('it leaves the session null for a process outside an atc session scope', () => {
  expect(
    parseAtcMcpProcess({
      pid: 58,
      cmdline: 'atc\0mcp\0',
      stat: '58 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 100 3670016 448',
      exe: '/opt/kettle/atc',
      cgroup: '0::/user.slice/user@1000.service/app.slice/tmux.scope\n',
      btime: 1000,
    }),
  ).toStrictEqual({ pid: 58, sessionID: null, startedAtMs: 1_001_000, exe: '/opt/kettle/atc' });
});

test('it returns null for a process that is not atc mcp', () => {
  expect(
    parseAtcMcpProcess({
      pid: 56,
      cmdline: 'atc\0daemon\0',
      stat: '56 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 100 3670016 448',
      exe: '/opt/kettle/atc',
      cgroup: '0::/user.slice/other.scope\n',
      btime: 1000,
    }),
  ).toBeNull();
});

test('it reports no start time for stat text cut short of field 22', () => {
  expect(parseAtcMcpProcess({ pid: 55, cmdline: 'atc\0mcp\0', stat: '55 (atc) S 1', exe: '/opt/kettle/atc', cgroup: '0::/user.slice/other.scope\n', btime: 1000 })).toBe('no start time');
});
