import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateEnv } from '@zgeoff/testing/helpers';
import { readLastRestart } from './read-last-restart.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-last-restart-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  updateEnv('HQ_ATC_STATE', directory);
  return { directory };
}

test('#readLastRestart reads the record atc wrote', async () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, 'restarts'));
  writeFileSync(join(ctx.directory, 'restarts', 'last.json'), JSON.stringify({ runID: 'run-1', code: 0, restored: 3, total: 4, interrupted: [{ id: 'id-1', name: 'z-kettle' }], failed: [{ id: 'id-2' }] }));

  const record = await readLastRestart();

  expect(record).toStrictEqual({ runID: 'run-1', code: 0, restored: 3, total: 4, interrupted: [{ id: 'id-1', name: 'z-kettle' }], failed: [{ id: 'id-2' }] });
});

test('#readLastRestart rejects a missing record with no_restart', () => {
  setupTest();

  expect(readLastRestart()).rejects.toMatchObject({ code: 'no_restart' });
});

test('#readLastRestart rejects a record of the wrong shape with bad_restart', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, 'restarts'));
  writeFileSync(join(ctx.directory, 'restarts', 'last.json'), JSON.stringify({ runID: 'run-1', code: 'zero' }));

  expect(readLastRestart()).rejects.toMatchObject({ code: 'bad_restart' });
});
