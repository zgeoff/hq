import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundedRunner } from '../src/runner/bounded-runner.ts';
import { realRunner } from '../src/runner/real-runner.ts';
import { TIMED_OUT } from '../src/runner/timed-out.ts';
import { waitFor } from './wait-for.ts';

test('a hung command is killed at its deadline and reports 124', async () => {
  const t0 = Date.now();
  const r = await realRunner(['sleep', '30'], { timeoutMs: 300 });
  expect(r.code).toBe(TIMED_OUT);
  expect(r.stderr).toContain('sleep timed out');
  expect(Date.now() - t0).toBeLessThan(5_000);
});

test('an aborted signal kills a running command', async () => {
  const abort = new AbortController();
  const started = Date.now();
  const pending = realRunner(['sleep', '30'], { signal: abort.signal });

  abort.abort();
  const result = await pending;

  expect(result.code).not.toBe(0);
  expect(Date.now() - started).toBeLessThan(5000);
});

test('a signal aborted before the call starts no command', () => {
  expect(realRunner(['sleep', '30'], { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
});

test('a command that ignores TERM is killed once its grace runs out', async () => {
  const started = Date.now();
  const result = await realRunner(['bash', '-c', 'trap "" TERM; sleep 30'], { timeoutMs: 300, killGraceMs: 100 });
  expect(result.code).toBe(TIMED_OUT);
  expect(Date.now() - started).toBeLessThan(1500);
});

test('a grandchild holding the pipe does not hold a timed call past its settle time', async () => {
  const started = Date.now();
  const result = await realRunner(['bash', '-c', 'echo hi; (sleep 30 &) ; exit 0'], { timeoutMs: 10_000, settleMs: 50 });
  expect(result.code).toBe(0);
  expect(Date.now() - started).toBeLessThan(1000);
});

test('a quick command is untouched, and boundedRunner sets a default deadline', async () => {
  expect(await realRunner(['echo', 'tea'], { timeoutMs: 5_000 })).toEqual({ code: 0, stdout: 'tea\n', stderr: '' });
  expect(await realRunner(['echo', 'tea'])).toEqual({ code: 0, stdout: 'tea\n', stderr: '' });
  const seen: (number | undefined)[] = [];
  const fake = boundedRunner(async (_c, o) => (seen.push(o?.timeoutMs), { code: 0, stdout: '', stderr: '' }), 60_000);
  await fake(['x']);
  await fake(['x'], { timeoutMs: 5 });
  expect(seen).toEqual([60_000, 5]);
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('the deadline reaches the whole process group, a TERM-ignoring child included', async () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hq-runner-')), 'pid');
  const result = await realRunner(['bash', '-c', `bash -c 'trap "" TERM; echo $$ > ${f}; exec sleep 30' & wait`], { timeoutMs: 500, killGraceMs: 100 });
  expect(result.code).toBe(TIMED_OUT);
  const child = Number(readFileSync(f, 'utf8').trim());
  expect(child).toBeGreaterThan(1);

  // The KILL that follows the TERM ends the child well inside the 30 s it would sleep.
  await waitFor('the TERM-ignoring child to be gone', () => !alive(child));
});

test('an untimed command is not put in its own session', async () => {
  const r = await realRunner(['bash', '-c', 'ps -o sid= -p $$; ps -o sid= -p $PPID']);
  const [mine, parent] = r.stdout.trim().split(/\s+/);
  expect(mine).toBe(parent);
});

test('a one-shot process that times out still kills the TERM-ignoring child before it exits', async () => {
  const d = mkdtempSync(join(tmpdir(), 'hq-runner-'));
  const f = join(d, 'pid');
  const script = join(d, 'once.ts');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(script, `import { realRunner } from ${JSON.stringify(join(import.meta.dir, '../src/runner/real-runner.ts'))};\nawait realRunner(['bash', '-c', \`bash -c 'trap "" TERM; echo $$ > ${f}; exec sleep 30' & wait\`], { stdoutFile: ${JSON.stringify(join(d, 'out'))}, timeoutMs: 300, killGraceMs: 100 });\n`);
  const p = Bun.spawn(['bun', script], { stdout: 'ignore', stderr: 'ignore' });
  await p.exited;
  const child = Number(readFileSync(f, 'utf8').trim());

  // The KILL went out before the process exited; the wait covers only the child's reaping.
  await waitFor('the TERM-ignoring child to be gone', () => !alive(child));
});
