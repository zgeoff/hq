import { expect, test } from 'bun:test';
import { buildStubAtcMcpFiles } from '../../test/build-stub-atc-mcp-files.ts';
import { readAtcMcp } from './read-atc-mcp.ts';

test('it reads an atc mcp process with its session, start time and exe, against the binary', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: {
      '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n',
      '/proc/55/cmdline': '/opt/kettle/atc\0mcp\0',
      '/proc/55/stat': '55 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 3670016 448',
      '/proc/55/cgroup': '0::/user.slice/atc-daemon-session-deadbeef-1a2b3c4d-1111-2222-3333-444455556666-cafef00d.scope\n',
    },
    links: { '/proc/55/exe': '/opt/kettle/atc (deleted)' },
  });

  expect(readAtcMcp(files)).toStrictEqual({
    processes: [{ pid: 55, sessionID: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_002_500, exe: '/opt/kettle/atc (deleted)' }],
    binary: { path: '/opt/kettle/atc', mtimeMs: 1_700_000_123_000 },
  });
});

test('it reads only the cmdline of a process that is not atc mcp', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: { '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n', '/proc/1/cmdline': '/sbin/init\0' },
    failures: { '/proc/1/stat': 'EACCES', '/proc/1/exe': 'EACCES', '/proc/1/cgroup': 'EACCES' },
  });

  expect(readAtcMcp(files)).toStrictEqual({ processes: [], binary: { path: '/opt/kettle/atc', mtimeMs: 1_700_000_123_000 } });
});

test('it ignores a /proc entry that is not a pid', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: { '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n', '/proc/self/cmdline': 'atc\0mcp\0' },
  });

  expect(readAtcMcp(files)).toStrictEqual({ processes: [], binary: { path: '/opt/kettle/atc', mtimeMs: 1_700_000_123_000 } });
});

test('it skips a process whose files vanished mid-scan and still reads the others', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: {
      '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n',
      '/proc/57/cmdline': 'atc\0mcp\0',
      '/proc/58/cmdline': 'atc\0mcp\0',
      '/proc/58/stat': '58 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 100 3670016 448',
      '/proc/58/cgroup': '0::/user.slice/other.scope\n',
    },
    links: { '/proc/58/exe': '/opt/kettle/atc' },
  });

  expect(readAtcMcp(files)).toStrictEqual({ processes: [{ pid: 58, sessionID: null, startedAtMs: 1_001_000, exe: '/opt/kettle/atc' }], binary: { path: '/opt/kettle/atc', mtimeMs: 1_700_000_123_000 } });
});

test('it skips a process whose exe link reports it has exited', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: {
      '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n',
      '/proc/57/cmdline': 'atc\0mcp\0',
      '/proc/57/stat': '57 (atc) Z 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 100 0 0',
      '/proc/57/cgroup': '0::/user.slice/other.scope\n',
    },
    failures: { '/proc/57/exe': 'ESRCH' },
  });

  expect(readAtcMcp(files)).toStrictEqual({ processes: [], binary: { path: '/opt/kettle/atc', mtimeMs: 1_700_000_123_000 } });
});

test('it returns an error naming the pid and file when a live process refuses a read', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: {
      '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n',
      '/proc/55/cmdline': 'atc\0mcp\0',
      '/proc/55/stat': '55 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 3670016 448',
      '/proc/55/cgroup': '0::/user.slice/other.scope\n',
    },
    failures: { '/proc/55/exe': 'EACCES' },
  });

  expect(readAtcMcp(files)).toBe("pid 55: can't read /proc/55/exe: EACCES");
});

test('it returns an error naming the pid and file when a process file fails with an i/o error', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: { '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n' },
    failures: { '/proc/55/cmdline': 'EIO' },
  });

  expect(readAtcMcp(files)).toBe("pid 55: can't read /proc/55/cmdline: EIO");
});

test('it returns an error naming the stat file when a process has no start time', () => {
  const files = buildStubAtcMcpFiles({
    atc: '/opt/kettle/atc',
    mtimes: { '/opt/kettle/atc': 1_700_000_123_000 },
    files: { '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n', '/proc/55/cmdline': 'atc\0mcp\0', '/proc/55/stat': '55 (atc) S 1', '/proc/55/cgroup': '' },
    links: { '/proc/55/exe': '/opt/kettle/atc' },
  });

  expect(readAtcMcp(files)).toBe('no start time in /proc/55/stat');
});

test('it returns an error naming /proc/stat when it has no btime line', () => {
  const files = buildStubAtcMcpFiles({ atc: '/opt/kettle/atc', mtimes: { '/opt/kettle/atc': 1_700_000_123_000 }, files: { '/proc/stat': 'cpu  41 0 17 900\nprocesses 812\n' } });

  expect(readAtcMcp(files)).toBe('no btime in /proc/stat');
});

test('it returns an error when atc is not on PATH', () => {
  const files = buildStubAtcMcpFiles({ atc: null, files: { '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n' } });

  expect(readAtcMcp(files)).toBe('no atc on PATH');
});

test('it returns an error naming the path when the binary is missing', () => {
  const files = buildStubAtcMcpFiles({ atc: '/opt/kettle/atc', files: { '/proc/stat': 'cpu  41 0 17 900\nbtime 1000\n' } });

  expect(readAtcMcp(files)).toBe("ENOENT: no such file or directory, stat '/opt/kettle/atc'");
});

test('it returns an error naming /proc/stat when it cannot be read', () => {
  const files = buildStubAtcMcpFiles({ atc: '/opt/kettle/atc', mtimes: { '/opt/kettle/atc': 1_700_000_123_000 }, failures: { '/proc/stat': 'EACCES' } });

  expect(readAtcMcp(files)).toBe("EACCES: permission denied, open '/proc/stat'");
});
