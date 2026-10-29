import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAtcMcp } from './read-atc-mcp.ts';

interface ProcessFiles {
  cmdline: string;
  ticks?: number;
  cgroup?: string;
  exe?: string;
}

// A fake /proc tree with btime 1000 and a fake atc binary; each test adds the processes it needs.
function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-atc-mcp-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const procRoot = join(directory, 'proc');
  mkdirSync(procRoot);
  writeFileSync(join(procRoot, 'stat'), 'cpu 1 2 3\nbtime 1000\n');
  const binary = join(directory, 'atc');
  writeFileSync(binary, '');

  // field 22 (starttime) is the 20th after the ')' of comm, which holds a space on purpose
  const addProcess = (pid: number, files: ProcessFiles) => {
    const processDirectory = join(procRoot, String(pid));
    mkdirSync(processDirectory);
    writeFileSync(join(processDirectory, 'cmdline'), files.cmdline);
    if (files.ticks !== undefined) {
      writeFileSync(join(processDirectory, 'stat'), `${pid} (a tc) S ${Array.from({ length: 18 }, () => '0').join(' ')} ${files.ticks} 0 0`);
    }
    if (files.cgroup !== undefined) {
      writeFileSync(join(processDirectory, 'cgroup'), files.cgroup);
    }
    if (files.exe !== undefined) {
      symlinkSync(files.exe, join(processDirectory, 'exe'));
    }
  };

  return { directory, procRoot, binary, addProcess };
}

test('it reads an atc mcp process with its session, start time and exe', () => {
  const ctx = setupTest();
  ctx.addProcess(55, {
    cmdline: '/home/x/.local/bin/atc\0mcp\0',
    ticks: 250,
    cgroup: '0::/user.slice/atc-daemon-session-deadbeef-1a2b3c4d-1111-2222-3333-444455556666-cafef00d.scope\n',
    exe: '/x/atc (deleted)',
  });

  const read = readAtcMcp(ctx.procRoot, ctx.binary);

  if (typeof read === 'string') {
    throw new TypeError(read);
  }
  expect(read.processes).toStrictEqual([{ pid: 55, sessionId: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_002_500, exe: '/x/atc (deleted)' }]);
});

test('it ignores a process that is not atc mcp', () => {
  const ctx = setupTest();
  ctx.addProcess(56, { cmdline: 'atc\0daemon\0' });

  const read = readAtcMcp(ctx.procRoot, ctx.binary);

  if (typeof read === 'string') {
    throw new TypeError(read);
  }
  expect(read.processes).toStrictEqual([]);
});

test('it skips a process that vanishes mid-scan and still reads the others', () => {
  const ctx = setupTest();
  ctx.addProcess(57, { cmdline: 'atc\0mcp\0' });
  ctx.addProcess(58, { cmdline: 'atc\0mcp\0', ticks: 100, cgroup: '0::/user.slice/other.scope\n', exe: '/x/atc' });

  const read = readAtcMcp(ctx.procRoot, ctx.binary);

  if (typeof read === 'string') {
    throw new TypeError(read);
  }
  expect(read.processes).toStrictEqual([{ pid: 58, sessionId: null, startedAtMs: 1_001_000, exe: '/x/atc' }]);
});

test('it reports the binary path and modification time', () => {
  const ctx = setupTest();
  utimesSync(ctx.binary, new Date(1_700_000_000_000), new Date(1_700_000_123_000));

  const read = readAtcMcp(ctx.procRoot, ctx.binary);

  if (typeof read === 'string') {
    throw new TypeError(read);
  }
  expect(read.binary).toStrictEqual({ path: ctx.binary, mtimeMs: 1_700_000_123_000 });
});

test('it returns an error naming the path when the binary is missing', () => {
  const ctx = setupTest();
  const missing = join(ctx.directory, 'nope');

  const read = readAtcMcp(ctx.procRoot, missing);

  expect(read).toContain(`ENOENT: no such file or directory, stat '${missing}'`);
});

test('it returns an error naming the path when the proc root is unreadable', () => {
  const ctx = setupTest();
  const missing = join(ctx.directory, 'no-proc');

  const read = readAtcMcp(missing, ctx.binary);

  expect(read).toContain(`ENOENT: no such file or directory, open '${join(missing, 'stat')}'`);
});
