import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAtcMcp } from './read-atc-mcp.ts';

const ID = '1a2b3c4d-1111-2222-3333-444455556666';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-atc-mcp-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const proc = join(dir, 'proc');
  mkdirSync(proc);
  writeFileSync(join(proc, 'stat'), 'cpu 1 2 3\nbtime 1000\n');
  const binary = join(dir, 'atc');
  writeFileSync(binary, '');
  return { dir, proc, binary };
}

// field 22 (starttime) is the 20th after the ')' of comm
const statLine = (ticks: number) => `5 (a tc) S ${Array.from({ length: 18 }, () => '0').join(' ')} ${ticks} 0 0`;

test('it reads an atc mcp process with its session, start time and exe', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.proc, '55'));
  writeFileSync(join(ctx.proc, '55', 'cmdline'), '/home/x/.local/bin/atc\0mcp\0');
  writeFileSync(join(ctx.proc, '55', 'stat'), statLine(250));
  writeFileSync(join(ctx.proc, '55', 'cgroup'), `0::/user.slice/atc-daemon-session-deadbeef-${ID}-cafef00d.scope\n`);
  symlinkSync('/x/atc (deleted)', join(ctx.proc, '55', 'exe'));

  const read = readAtcMcp(ctx.proc, ctx.binary);

  expect(typeof read === 'string' ? read : read.processes).toStrictEqual([{ pid: 55, sessionId: ID, startedAtMs: 1_002_500, exe: '/x/atc (deleted)' }]);
});

test('it ignores a process that is not atc mcp', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.proc, '56'));
  writeFileSync(join(ctx.proc, '56', 'cmdline'), 'atc\0daemon\0');

  const read = readAtcMcp(ctx.proc, ctx.binary);

  expect(typeof read === 'string' ? read : read.processes).toStrictEqual([]);
});

test('it skips a process that vanishes mid-scan', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.proc, '57'));
  writeFileSync(join(ctx.proc, '57', 'cmdline'), 'atc\0mcp\0');

  const read = readAtcMcp(ctx.proc, ctx.binary);

  expect(typeof read === 'string' ? read : read.processes).toStrictEqual([]);
});

test('it reports the binary path and modification time', () => {
  const ctx = setupTest();

  const read = readAtcMcp(ctx.proc, ctx.binary);

  expect(typeof read === 'string' ? read : read.binary.path).toBe(ctx.binary);
});

test('it returns an error when the binary is missing', () => {
  const ctx = setupTest();

  expect(readAtcMcp(ctx.proc, join(ctx.dir, 'nope'))).toBeString();
});

test('it returns an error when the proc root is unreadable', () => {
  const ctx = setupTest();

  expect(readAtcMcp(join(ctx.dir, 'no-proc'), ctx.binary)).toBeString();
});
