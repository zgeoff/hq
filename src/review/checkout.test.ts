import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../config/override-env.ts';
import type { Runner } from '../runner/types.ts';
import { checkout } from './checkout.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-checkout-'));
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_PROJECTS', join(base, 'projects')));
  onTestFinished(overrideEnv('HQ_REPOS', join(base, 'repos')));
  const clones: string[] = [];

  const run: Runner = async (cmd) => {
    if (cmd[0] === 'gh' && cmd[1] === 'repo' && cmd[2] === 'clone') {
      const target = cmd[4] ?? '';
      if (existsSync(target)) {
        return { code: 1, stdout: '', stderr: `destination path '${target}' already exists` };
      }
      clones.push(target);
      mkdirSync(target, { recursive: true });
      // oxlint-disable-next-line zgeoff/no-test-sleep -- the fault under test: a clone whose folder exists before its files
      await Bun.sleep(20);
      writeFileSync(join(target, 'kettle.txt'), `cloned ${clones.length}\n`);
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: 'no origin' };
  };
  return { cached: join(base, 'repos', 'zgeoff', 'kettle'), clones, run };
}

test('two first reviews of a repo both get one complete cached clone', async () => {
  const app = setupTest();

  const readOnReturn = async (): Promise<boolean> => {
    const directory = await checkout(app.run, 'zgeoff/kettle', 'kettle');
    return existsSync(join(directory, 'kettle.txt'));
  };

  const complete = await Promise.all([readOnReturn(), readOnReturn()]);

  expect(complete).toStrictEqual([true, true]);
  expect(readFileSync(join(app.cached, 'kettle.txt'), 'utf8')).toMatch(/^cloned \d\n$/u);
  expect(readdirSync(join(app.cached, '..')).toSorted()).toStrictEqual(['kettle', 'kettle.flock']);
});

test('a review reuses a cached clone that already exists', async () => {
  const app = setupTest();
  mkdirSync(app.cached, { recursive: true });

  await expect(checkout(app.run, 'zgeoff/kettle', 'kettle')).resolves.toBe(app.cached);

  expect(app.clones).toStrictEqual([]);
});
