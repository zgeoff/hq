import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundedRunner } from '../src/runner/bounded-runner.ts';
import { realRunner } from '../src/runner/real-runner.ts';
import { TIMED_OUT } from '../src/runner/timed-out.ts';

test('a hung command is killed at its deadline and reports 124', async () => {
  const t0 = Date.now();
  const r = await realRunner(['sleep', '30'], { timeoutMs: 300 });
  expect(r.code).toBe(TIMED_OUT);
  expect(r.stderr).toContain('sleep timed out');
  expect(Date.now() - t0).toBeLessThan(5_000);
});

test('a command that ignores TERM is killed', async () => {
  const t0 = Date.now();
  const r = await realRunner(['bash', '-c', 'trap "" TERM; sleep 30'], { timeoutMs: 300 });
  expect(r.code).toBe(TIMED_OUT);
  expect(Date.now() - t0).toBeLessThan(6_000);
}, 10_000);

test('a grandchild holding the pipe does not hold a timed call', async () => {
  const t0 = Date.now();
  const r = await realRunner(['bash', '-c', 'echo hi; (sleep 30 &) ; exit 0'], { timeoutMs: 10_000 });
  expect(r.code).toBe(0);
  expect(Date.now() - t0).toBeLessThan(4_000);
}, 10_000);

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
  const r = await realRunner(['bash', '-c', `bash -c 'trap "" TERM; echo $$ > ${f}; exec sleep 30' & wait`], { timeoutMs: 500 });
  expect(r.code).toBe(TIMED_OUT);
  const child = Number(readFileSync(f, 'utf8').trim());
  expect(child).toBeGreaterThan(1);
  await Bun.sleep(2_600); // past the KILL that follows the TERM
  expect(alive(child)).toBe(false);
}, 15_000);

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
  writeFileSync(script, `import { realRunner } from ${JSON.stringify(join(import.meta.dir, '../src/runner/real-runner.ts'))};\nawait realRunner(['bash', '-c', \`bash -c 'trap "" TERM; echo $$ > ${f}; exec sleep 30' & wait\`], { stdoutFile: ${JSON.stringify(join(d, 'out'))}, timeoutMs: 300 });\n`);
  const p = Bun.spawn(['bun', script], { stdout: 'ignore', stderr: 'ignore' });
  await p.exited;
  const child = Number(readFileSync(f, 'utf8').trim());
  await Bun.sleep(300);
  expect(alive(child)).toBe(false);
}, 20_000);
