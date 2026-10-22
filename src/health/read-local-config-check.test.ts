import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalConfigCheck } from './read-local-config-check.ts';

// A temporary folder for the local file; each test writes its own file there.
function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-local-check-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return { file: join(dir, 'local.json') };
}

test('all six keys in the file make an ok check', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_NOSLOP_OP_VAULT: 'a', HQ_NOSLOP_OP_ITEM: 'b', HQ_LINEAR_OP_REF: 'c', HQ_PROBE_TARGET: 'd', HQ_PROBE_READY: 'e', HQ_CLOUD_METRICS_URL: 'f', HQ_CLOUD_HOST: 'g' }));

  expect(readLocalConfigCheck({ HQ_LOCAL_CONFIG: ctx.file })).toStrictEqual({ key: 'local-config', ok: true, line: 'local settings: all 7 set' });
});

test('keys split between the environment and the file make an ok check', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_TARGET: 'a', HQ_PROBE_READY: 'b' }));

  expect(readLocalConfigCheck({ HQ_LOCAL_CONFIG: ctx.file, HQ_NOSLOP_OP_VAULT: 'c', HQ_NOSLOP_OP_ITEM: 'd', HQ_LINEAR_OP_REF: 'e', HQ_CLOUD_METRICS_URL: 'f', HQ_CLOUD_HOST: 'g' }).ok).toBe(true);
});

test('missing keys make a not-ok check that lists them and the file path', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_TARGET: 'a' }));

  expect(readLocalConfigCheck({ HQ_LOCAL_CONFIG: ctx.file })).toStrictEqual({ key: 'local-config', ok: false, line: `local settings: HQ_NOSLOP_OP_VAULT, HQ_NOSLOP_OP_ITEM, HQ_LINEAR_OP_REF, HQ_PROBE_READY, HQ_CLOUD_METRICS_URL, HQ_CLOUD_HOST not set; put them in ${ctx.file} or the environment` });
});

test('a missing file makes a not-ok check', () => {
  const ctx = setupTest();

  expect(readLocalConfigCheck({ HQ_LOCAL_CONFIG: ctx.file }).ok).toBe(false);
});

test('a bad file makes a not-ok check naming the file', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, '{ kettle');

  expect(readLocalConfigCheck({ HQ_LOCAL_CONFIG: ctx.file })).toStrictEqual({ key: 'local-config', ok: false, line: expect.stringContaining(ctx.file) });
});
