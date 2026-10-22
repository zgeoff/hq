import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootTime } from '../src/rc/boot-time.ts';
import { pidFromCmdlines } from '../src/rc/pid-from-cmdlines.ts';
import { procStart } from '../src/rc/proc-start.ts';
import { RC_CAP } from '../src/rc/rc-cap.ts';
import { rcFromConfig } from '../src/rc/rc-from-config.ts';
import { rcState } from '../src/rc/rc-state.ts';
import { scanProc } from '../src/rc/scan-proc.ts';

const SID = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const claude = (id: string, pid: number) => ({ pid, args: ['/x/claude', '--model', 'opus', '--add-dir', `/state/atc/sessions/${id}/scratch`, '--settings', 'y'] });
const config = (placeholders: unknown) => JSON.stringify({ projects: {}, ...(placeholders === undefined ? {} : { replBridgePlaceholders: placeholders }) });
const NOW = Date.parse('2026-10-16T10:00:00Z');
const HOUR = 3_600_000;
const entry = (pid: unknown, createdAt = NOW - HOUR, start = '9001') => ({ pid, createdAt, titleSha: 'invented', procStart: start, usedAt: createdAt + 1 });
const alive = (_pid: number): boolean => true;
const started = (_pid: number): string | null => '9001'; // the live process's start time, as /proc gives it
const live = { pid: 4242 };
const BOOT = NOW - 10 * HOUR;
const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`cse_${i}`, entry(100 + i)]));

test.each([
  ['on: a bridge entry has the session pid', config({ cse_a: entry(4242) }), live, alive, 'on'],
  ['on among other sessions', config({ cse_a: entry(1), cse_b: entry(4242) }), live, alive, 'on'],
  ['off: no entry has the pid, and another was written in the last day', config({ cse_a: entry(1) }), live, alive, 'off'],
  ['unknown: no entry has the pid, and none was written in the last day', config({ cse_a: entry(1, NOW - 25 * HOUR) }), live, alive, 'unknown'],
  ['unknown: no entry has the pid, and the newest has no time', config({ cse_a: { pid: 1 } }), live, alive, 'unknown'],
  ['unknown: a list at the cap could have evicted this one', config(many(RC_CAP)), live, alive, 'unknown'],
  ['off: one under the cap', config(many(RC_CAP - 1)), live, alive, 'off'],
  ['unknown: empty placeholders, so no proof of writes', config({}), live, alive, 'unknown'],
  ['unknown: the record is an earlier process with the same pid', config({ cse_a: entry(4242, NOW - HOUR, '1234') }), live, alive, 'unknown'],
  ['unknown: the record is from before the last boot', config({ cse_a: entry(4242, BOOT - HOUR) }), live, alive, 'unknown'],
  ['unknown: off needs the live process', config({ cse_a: entry(1) }), live, (_pid: number): boolean => false, 'unknown'],
  ['unknown: the record has no process start time to check', config({ cse_a: { pid: 4242, createdAt: NOW - HOUR } }), live, alive, 'unknown'],
  ['unknown: no replBridgePlaceholders key', config(undefined), live, alive, 'unknown'],
  ['unknown: the file is missing', null, live, alive, 'unknown'],
  ['unknown: bad JSON', '{not json', live, alive, 'unknown'],
  ['unknown: the file is not an object', '[]', live, alive, 'unknown'],
  ['unknown: placeholders is a string', config('nope'), live, alive, 'unknown'],
  ['unknown: placeholders is an array', config([entry(4242)]), live, alive, 'unknown'],
  ['unknown: an entry without a numeric pid', config({ cse_a: entry('4242'), cse_b: entry(4242) }), live, alive, 'unknown'],
  ['unknown: an entry that is not an object', config({ cse_a: null }), live, alive, 'unknown'],
  ['unknown: the matching pid is not alive', config({ cse_a: entry(4242) }), live, (_pid: number): boolean => false, 'unknown'],
  ['unknown: process not found', config({ cse_a: entry(4242) }), { why: 'no process' }, alive, 'unknown'],
  ['unknown: two processes found', config({ cse_a: entry(4242) }), { why: '2 processes' }, alive, 'unknown'],
] as const)('rcFromConfig %s', (_n, text, found, isAlive, state) => {
  expect(rcFromConfig(text, found, isAlive, started, NOW, BOOT).state).toBe(state);
});

test('both answers need the live start time: unreadable means unknown', () => {
  expect(rcFromConfig(config({ cse_a: entry(4242) }), live, alive, () => null, NOW, BOOT).state).toBe('unknown');
  expect(rcFromConfig(config({ cse_a: entry(1) }), live, alive, () => null, NOW, BOOT).state).toBe('unknown');
  expect(rcFromConfig(config({ cse_a: entry(4242) }), live, alive, started, NOW, null).state).toBe('unknown'); // boot time unreadable
});

test('bootTime reads btime from a stat file', () => {
  const proc = join(dir, 'proc');
  mkdirSync(proc, { recursive: true });
  writeFileSync(join(proc, 'stat'), 'cpu  1 2 3\nbtime 1792001071\nprocesses 9\n');
  expect(bootTime(proc)).toBe(1792001071000);
  expect(bootTime(join(dir, 'none'))).toBeNull();
});

test('procStart reads field 22 of a stat line, counting from the last parenthesis', () => {
  const proc = join(dir, 'proc');
  mkdirSync(join(proc, '77'), { recursive: true });
  const fields = Array.from({ length: 50 }, (_, i) => String(i + 3)); // field 3 onward
  fields[19] = '5550001';
  writeFileSync(join(proc, '77', 'stat'), `77 (a) b) ${fields.join(' ')}`);
  expect(procStart(77, proc)).toBe('5550001');
  expect(procStart(78, proc)).toBeNull();
});

test('the session pid comes from the process whose --add-dir is the session directory', () => {
  const procs = [claude(OTHER, 10), claude(SID, 11), { pid: 12, args: ['/bin/zsh', '-c', `echo /state/atc/sessions/${SID}/scratch`] }];
  expect(pidFromCmdlines(SID, procs)).toEqual({ pid: 11 });
  expect(pidFromCmdlines('00000000-0000-0000-0000-000000000000', procs)).toMatchObject({ why: expect.stringContaining('no process') });
  expect(pidFromCmdlines(SID, [...procs, claude(SID, 13)])).toMatchObject({ why: expect.stringContaining('2 processes') });
  expect(pidFromCmdlines(SID, [{ pid: 14, args: ['claude', `--add-dir=/state/atc/sessions/${SID}`] }])).toEqual({ pid: 14 });
  expect(pidFromCmdlines(SID, [{ pid: 15, args: ['claude', '--add-dir', `/state/atc/sessions/${SID}x/scratch`] }])).toMatchObject({ why: expect.any(String) }); // a longer id is another session
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-rc-'));
});
afterEach(() => {
  delete process.env['HQ_CLAUDE_JSON'];
  rmSync(dir, { recursive: true, force: true });
});

test('scanProc reads a proc-shaped directory; the real /proc is never scanned in tests', () => {
  const proc = join(dir, 'proc');
  for (const [pid, id] of [[10, OTHER], [11, SID]] as const) {
    mkdirSync(join(proc, String(pid)), { recursive: true });
    writeFileSync(join(proc, String(pid), 'cmdline'), ['claude', '--add-dir', `/state/atc/sessions/${id}/scratch`].join('\0'));
  }
  mkdirSync(join(proc, 'self'));
  expect(scanProc(SID, proc)).toEqual({ pid: 11 });
  expect(scanProc(SID, join(dir, 'nope'))).toMatchObject({ why: expect.stringContaining("can't read") });
});

test('rcState reads the config named by HQ_CLAUDE_JSON and leaves the file as it was', () => {
  const file = join(dir, 'claude.json');
  process.env['HQ_CLAUDE_JSON'] = file;
  const text = config({ cse_a: entry(4242) });
  writeFileSync(file, text);
  const src = { findPid: () => live, alive, start: started, now: () => NOW, boot: () => BOOT };
  expect(rcState(SID, src).state).toBe('on');
  writeFileSync(file, config({ cse_a: entry(7) }));
  expect(rcState(SID, src).state).toBe('off'); // another process's record, written today
  rmSync(file);
  expect(rcState(SID, src).state).toBe('unknown');
  writeFileSync(file, text);
  const mtime = statSync(file).mtimeMs;
  rcState(SID, src);
  expect(statSync(file).mtimeMs).toBe(mtime);
  expect(readFileSync(file, 'utf8')).toBe(text);
});

test('no code in src writes, renames, locks or opens for writing the Claude Code config file', () => {
  const files = readdirSync(join(import.meta.dir, '..', 'src'), { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  const mentions = /getClaudeJson|HQ_CLAUDE_JSON|\.claude\.json/u;
  const writers = /writeFileSync|appendFileSync|renameSync|copyFileSync|unlinkSync|rmSync|openSync|createWriteStream|Bun\.write|\.delete\(|flock|chmod/;
  const offenders: string[] = [];
  const checked: string[] = [];
  for (const f of files) {
    const text = readFileSync(join(import.meta.dir, '..', 'src', f), 'utf8');
    // A file that mentions the config path and also writes anywhere is checked line by line.
    if (!mentions.test(text)) continue;
    checked.push(f);
    text.split('\n').forEach((line, i) => {
      if (writers.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(checked).toStrictEqual(expect.arrayContaining(['trust/get-claude-json.ts', 'rc/rc-state.ts']));
  expect(offenders).toStrictEqual([]);
});
