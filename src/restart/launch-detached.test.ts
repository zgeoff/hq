import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../config/override-env.ts';
import type { Runner } from '../runner/types.ts';
import { launchDetached } from './launch-detached.ts';

function setupTest() {
  const home = mkdtempSync(join(tmpdir(), 'hq-launch-detached-'));

  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HOME', home));

  return { home };
}

test('it hands the detached restart a relative HQ_DB as an absolute path', async () => {
  setupTest();
  onTestFinished(overrideEnv('HQ_DB', 'invented/hq.db'));
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: '', stderr: '' }));

  await launchDetached(run, { force: true });

  expect(run.mock.calls[0]?.[0]).toContain(`--setenv=HQ_DB=${join(process.cwd(), 'invented', 'hq.db')}`);
});

test('it hands the detached restart a relative HQ_LOCAL_CONFIG as an absolute path', async () => {
  setupTest();
  onTestFinished(overrideEnv('HQ_LOCAL_CONFIG', 'invented/local.json'));
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: '', stderr: '' }));

  await launchDetached(run, { force: true });

  expect(run.mock.calls[0]?.[0]).toContain(`--setenv=HQ_LOCAL_CONFIG=${join(process.cwd(), 'invented', 'local.json')}`);
});

test('it hands the detached restart a relative HQ_PRIVATE_DIR as an absolute path', async () => {
  setupTest();
  onTestFinished(overrideEnv('HQ_PRIVATE_DIR', 'invented/private'));
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: '', stderr: '' }));

  await launchDetached(run, { force: true });

  expect(run.mock.calls[0]?.[0]).toContain(`--setenv=HQ_PRIVATE_DIR=${join(process.cwd(), 'invented', 'private')}`);
});
