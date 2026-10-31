import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { buildStubBriefGH } from '../../test/build-stub-brief-gh.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-cli-'));
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};

  onTestFinished(() => {
    console.log = log;
    console.error = error;
    rmSync(root, { recursive: true, force: true });
  });

  return { root };
}

test('hq brief through the CLI creates no hq db when there is none', async () => {
  const ctx = setupTest();
  const dir = join(ctx.root, 'absent');
  onTestFinished(overrideEnv('HQ_DB', join(dir, 'hq.db')));

  await main(['brief', 'GEO-9001', '--json'], buildStubBriefGH({ commits: {}, files: {} }, []));

  expect(existsSync(dir)).toBe(false);
});
