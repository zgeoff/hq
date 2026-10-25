import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../../config/override-env.ts';
import { readSlotOpToken } from './read-slot-op-token.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-slot-settings-'));
  const path = join(directory, 'settings.local.json');

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_SLOTS_OP_SETTINGS', path));

  return { path };
}

test('it reads the 1Password token from the settings file', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  const token = await readSlotOpToken();

  expect(token).toStrictEqual({ kind: 'ready', token: 'ops_kettle-profile-0001' });
});

test('it says the slot reads are not set up when the settings file is missing', async () => {
  const ctx = setupTest();

  const token = await readSlotOpToken();

  expect(token).toStrictEqual({ kind: 'not-set-up', reason: `no settings file at ${ctx.path}` });
});

test('it says the slot reads are not set up when the profile has no token', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.path, JSON.stringify({ env: {} }));
  const token = await readSlotOpToken();

  expect(token).toStrictEqual({ kind: 'not-set-up', reason: `no env.OP_SERVICE_ACCOUNT_TOKEN in ${ctx.path}` });
});

test('it refuses a settings file that is not JSON', () => {
  const ctx = setupTest();

  writeFileSync(ctx.path, 'not json');

  expect(readSlotOpToken()).rejects.toMatchObject({ code: 'bad_config' });
});
