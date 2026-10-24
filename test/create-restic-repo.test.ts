import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createResticRepo } from './create-restic-repo.ts';

// Skipped on a machine without restic, never in CI, which installs it.
const canRunRestic = process.env['CI'] !== undefined || Bun.which('restic') !== null;

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-restic-repo-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const password = join(directory, 'password');
  const runRestic = (repo: string, args: string[]) =>
    Bun.spawnSync(['restic', '-r', repo, '--password-file', password, '--no-cache', ...args], { env: { PATH: process.env['PATH'] ?? '' } });
  return { directory, password, runRestic };
}

test.skipIf(!canRunRestic)('it copies a repo that its password opens, with a key of cheap scrypt parameters', () => {
  const ctx = setupTest();
  const repo = join(ctx.directory, 'repo');

  createResticRepo(repo, ctx.password, 'local');

  const opened = ctx.runRestic(repo, ['cat', 'config']);
  const [keyName] = readdirSync(join(repo, 'keys'));
  const key: unknown = JSON.parse(readFileSync(join(repo, 'keys', keyName ?? ''), 'utf8'));
  expect([opened.exitCode, opened.stderr.toString()]).toStrictEqual([0, '']);
  expect(key).toMatchObject({ 'N': 128, 'r': 1, 'p': 1 });
});

test.skipIf(!canRunRestic)('it copies a remote that shares the local chunker polynomial under its own repository ID', () => {
  const ctx = setupTest();
  const local = join(ctx.directory, 'local');
  const remote = join(ctx.directory, 'remote');
  createResticRepo(local, ctx.password, 'local');
  createResticRepo(remote, ctx.password, 'remote');

  const ConfigSchema = z.object({ id: z.string(), chunker_polynomial: z.string() });
  const localConfig = ConfigSchema.parse(JSON.parse(ctx.runRestic(local, ['cat', 'config']).stdout.toString()));
  const remoteConfig = ConfigSchema.parse(JSON.parse(ctx.runRestic(remote, ['cat', 'config']).stdout.toString()));
  expect(remoteConfig.chunker_polynomial).toBe(localConfig.chunker_polynomial);
  expect(remoteConfig.id).not.toBe(localConfig.id);
});
