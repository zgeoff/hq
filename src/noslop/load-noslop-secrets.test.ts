import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { overrideEnv } from '../config/override-env.ts';
import { loadNoslopSecrets } from './load-noslop-secrets.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-run-'));

  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));

  return { base };
}

test('it says to re-mint the token when 1Password refuses it', async () => {
  setupTest();
  const fake = buildFakeRunner({ opAnswer: { code: 1, stdout: '', stderr: '[ERROR] service account token is invalid (401 Unauthorized)' } });

  await expect(loadNoslopSecrets(fake.run)).rejects.toMatchObject({
    code: 'bad_config',
    message: expect.stringContaining('1Password gave no app secrets for noslop (exit 1): re-mint with op-mint noslop'),
  });
});

test('it names the rate limit and how to see it when 1Password rate-limits the request', async () => {
  setupTest();
  const fake = buildFakeRunner({ opAnswer: { code: 1, stdout: '', stderr: '[ERROR] 2026/10/19 05:40:00 Too many requests' } });

  await expect(loadNoslopSecrets(fake.run)).rejects.toMatchObject({ message: "1Password gave no app secrets for noslop (exit 1): 1Password rate-limited the request; op service-account ratelimit shows which limit and when it resets" });
});

test('it reads all three fields in one op call', async () => {
  setupTest();
  const fake = buildFakeRunner(),
    secrets = await loadNoslopSecrets(fake.run);

  expect([fake.of('op').length, secrets]).toStrictEqual([1, { appID: 'app-4711', installationID: 'inst-8842', privateKey: '-----BEGIN KEY-----\nbadger-secret-key\n-----END KEY-----' }]);
});

test('it never puts what op read printed into the error when 1Password fails', async () => {
  setupTest();
  const fake = buildFakeRunner({ opAnswer: { code: 1, stdout: 'leaked-stdout-value', stderr: 'vault not found' } });

  await expect(loadNoslopSecrets(fake.run)).rejects.toMatchObject({ message: '1Password gave no app secrets for noslop (exit 1)' });
});

test('it says to re-mint when the token file has no token', async () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.base, 'settings.json'), JSON.stringify({ env: {} }));

  await expect(loadNoslopSecrets(buildFakeRunner().run)).rejects.toMatchObject({
    code: 'bad_config',
    message: expect.stringContaining('re-mint with op-mint noslop'),
  });
});

test.each([
  ['invalid JSON', 'not json'],
  ['an object, not a list of fields', '{}'],
])('it refuses an op answer that exits 0 with %s', async (_case, stdout) => {
  setupTest();
  const fake = buildFakeRunner({ opAnswer: { code: 0, stdout, stderr: '' } });

  await expect(loadNoslopSecrets(fake.run)).rejects.toMatchObject({ code: 'bad_config', message: "1Password's answer for noslop's app secrets is not a list of fields" });
});

test.each([
  ['an answer with an empty private key', { code: 0, stdout: JSON.stringify([{ label: 'app-id', value: 'app-4711' }, { label: 'installation-id', value: 'inst-8842' }, { label: 'private-key', value: '' }]), stderr: '' }],
  ['a refused read', { code: 1, stdout: '', stderr: 'vault not found' }],
])('it counts the read for the weekly audit even on %s', async (_case, opAnswer) => {
  setupTest();
  const counter = mock(() => {}),
    fake = buildFakeRunner({ opAnswer });

  await expect(loadNoslopSecrets(fake.run, counter)).rejects.toMatchObject({ code: 'bad_config' });
  expect(counter).toHaveBeenCalledTimes(1);
});
