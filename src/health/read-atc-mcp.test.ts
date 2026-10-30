import { expect, onTestFinished, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubFailingAtcMcpFiles } from '../../test/build-stub-failing-atc-mcp-files.ts';
import { buildNodeAtcMcpFiles } from './build-node-atc-mcp-files.ts';
import { readAtcMcp } from './read-atc-mcp.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-atc-mcp-'));

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads an atc mcp process with its session, start time and replaced exe, against the binary', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '55'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '55', 'cmdline'), `${binary}\0mcp\0`);
  writeFileSync(join(procRoot, '55', 'stat'), '55 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 3670016 448');
  writeFileSync(join(procRoot, '55', 'cgroup'), '0::/user.slice/atc-daemon-session-deadbeef-1a2b3c4d-1111-2222-3333-444455556666-cafef00d.scope\n');
  symlinkSync(`${binary} (deleted)`, join(procRoot, '55', 'exe'));
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toStrictEqual({
    processes: [{ pid: 55, sessionID: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_002_500, exe: `${binary} (deleted)` }],
    binary: { path: binary, mtimeMs: 1_700_000_123_000 },
  });
});

// root reads a mode-000 file, so the refused read this test needs never happens
test.skipIf(process.getuid?.() === 0)('it reads only the cmdline of a process that is not atc mcp', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '1'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '1', 'cmdline'), '/sbin/init\0');
  writeFileSync(join(procRoot, '1', 'stat'), '1 (init) S 0 1 1 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 5 3670016 448');
  chmodSync(join(procRoot, '1', 'stat'), 0o000);
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toStrictEqual({ processes: [], binary: { path: binary, mtimeMs: 1_700_000_123_000 } });
});

test('it ignores a proc entry that is not a pid', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, 'self'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, 'self', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toStrictEqual({ processes: [], binary: { path: binary, mtimeMs: 1_700_000_123_000 } });
});

test('it skips a process whose files vanished mid-scan and still reads the others', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '57'), { recursive: true });
  mkdirSync(join(procRoot, '58'));
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '57', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(join(procRoot, '58', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(join(procRoot, '58', 'stat'), '58 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 100 3670016 448');
  writeFileSync(join(procRoot, '58', 'cgroup'), '0::/user.slice/other.scope\n');
  symlinkSync(binary, join(procRoot, '58', 'exe'));
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toStrictEqual({
    processes: [{ pid: 58, sessionID: null, startedAtMs: 1_001_000, exe: binary }],
    binary: { path: binary, mtimeMs: 1_700_000_123_000 },
  });
});

test('it skips a process whose exe link reports it has exited', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '57'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '57', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(join(procRoot, '57', 'stat'), '57 (atc) Z 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 100 0 0');
  writeFileSync(join(procRoot, '57', 'cgroup'), '0::/user.slice/other.scope\n');
  symlinkSync(binary, join(procRoot, '57', 'exe'));
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  const files = buildStubFailingAtcMcpFiles(buildNodeAtcMcpFiles(procRoot, () => binary), { [join(procRoot, '57', 'exe')]: 'ESRCH' });

  expect(readAtcMcp(files)).toStrictEqual({ processes: [], binary: { path: binary, mtimeMs: 1_700_000_123_000 } });
});

// root reads a mode-000 file, so the refused read this test needs never happens
test.skipIf(process.getuid?.() === 0)('it returns an error naming the pid and file when a live process refuses a read', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '55'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '55', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(join(procRoot, '55', 'stat'), '55 (atc) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 3670016 448');
  chmodSync(join(procRoot, '55', 'stat'), 0o000);
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toBe(`pid 55: can't read ${join(procRoot, '55', 'stat')}: EACCES`);
});

test('it returns an error naming the pid and file when a process file fails with an i/o error', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '55'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '55', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(binary, '');
  utimesSync(binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  const files = buildStubFailingAtcMcpFiles(buildNodeAtcMcpFiles(procRoot, () => binary), { [join(procRoot, '55', 'cmdline')]: 'EIO' });

  expect(readAtcMcp(files)).toBe(`pid 55: can't read ${join(procRoot, '55', 'cmdline')}: EIO`);
});

test('it returns an error naming the stat file when a process has no start time', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(join(procRoot, '55'), { recursive: true });
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');
  writeFileSync(join(procRoot, '55', 'cmdline'), 'atc\0mcp\0');
  writeFileSync(join(procRoot, '55', 'stat'), '55 (atc) S 1');
  writeFileSync(join(procRoot, '55', 'cgroup'), '');
  symlinkSync(binary, join(procRoot, '55', 'exe'));
  writeFileSync(binary, '');

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toBe(`no start time in ${join(procRoot, '55', 'stat')}`);
});

test('it returns an error naming the proc stat file when it has no btime line', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(procRoot);
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nprocesses 812\n');
  writeFileSync(binary, '');

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toBe(`no btime in ${join(procRoot, 'stat')}`);
});

test('it returns an error when atc is not on PATH', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  mkdirSync(procRoot);
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => null))).toBe('no atc on PATH');
});

test('it returns an error naming the path when the binary is missing', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  mkdirSync(procRoot);
  writeFileSync(join(procRoot, 'stat'), 'cpu  41 0 17 900\nbtime 1000\n');

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toBe(`ENOENT: no such file or directory, stat '${binary}'`);
});

test('it returns an error naming the proc stat file when the proc root is missing', () => {
  const ctx = setupTest();
  const procRoot =join(ctx.directory, 'proc');
  const binary = join(ctx.directory, 'atc');
  writeFileSync(binary, '');

  expect(readAtcMcp(buildNodeAtcMcpFiles(procRoot, () => binary))).toBe(`ENOENT: no such file or directory, open '${join(procRoot, 'stat')}'`);
});
