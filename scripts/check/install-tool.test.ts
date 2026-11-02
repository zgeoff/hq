import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import { TOOLS, checkDigest, installTool, unpackTool } from './install-tool.ts';

function setupTest() {
  const directory = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-install-tool-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    kettle: new TextEncoder().encode('kettle\n'),
  };
}

test('it fails bytes whose digest differs from the pin, naming both digests', () => {
  const ctx = setupTest();

  expect(() => checkDigest(ctx.kettle, '0'.repeat(64), 'https://example.com/kettle')).toThrow(/^https:\/\/example\.com\/kettle: sha256 is [0-9a-f]{64}, expected 0{64}$/u);
});

test('it passes bytes that match the pin', () => {
  const ctx = setupTest();
  const digest = new Bun.CryptoHasher('sha256').update(ctx.kettle).digest('hex');

  expect(() => checkDigest(ctx.kettle, digest, 'https://example.com/kettle')).not.toThrow();
});

test('it unpacks a bz2 tool to an executable named for the tool', () => {
  const ctx = setupTest();
  const restic = TOOLS['restic'];
  assert.ok(restic);
  const packed = Bun.spawnSync(['bzip2', '-c'], { stdin: ctx.kettle }).stdout;
  const folder = unpackTool('kettle', { ...restic, unpack: 'bz2' }, packed, ctx.directory);

  expect(readFileSync(join(folder, 'kettle'), 'utf8')).toBe('kettle\n');
  expect(statSync(join(folder, 'kettle')).mode & 0o111).toBe(0o111);
});

test('it unpacks a tar.gz tool into its folder', () => {
  const ctx = setupTest();
  const gitleaks = TOOLS['gitleaks'];
  assert.ok(gitleaks);
  const source = join(ctx.directory, 'source');
  mkdirSync(join(source, 'kettle-v1'), { recursive: true });
  writeFileSync(join(source, 'kettle-v1', 'kettle'), 'kettle\n');
  const packed = Bun.spawnSync(['tar', '-czf', '-', '-C', source, 'kettle-v1']).stdout;
  const folder = unpackTool('kettle', { ...gitleaks, unpack: 'tar.gz', folder: 'kettle-v1' }, packed, join(ctx.directory, 'out'));

  expect(readFileSync(join(folder, 'kettle'), 'utf8')).toBe('kettle\n');
});

test('it rejects a download whose digest differs from the pin, and adds no folder to the path', async () => {
  const ctx = setupTest();
  const githubPath = join(ctx.directory, 'github-path');
  const tools = { kettle: { url: 'https://example.com/kettle.bz2', sha256: '0'.repeat(64), unpack: 'bz2', folder: '', version: ['kettle'] } } as const;
  const install = installTool('kettle', { tools, download: () => Promise.resolve(ctx.kettle), into: ctx.directory, githubPath });

  await expect(install).rejects.toThrow('https://example.com/kettle.bz2: sha256 is');
  expect(existsSync(githubPath)).toBe(false);
});

test('it installs a pinned download, returns its version line, and adds its folder to the path', async () => {
  const ctx = setupTest();
  const githubPath = join(ctx.directory, 'github-path');
  const script = new TextEncoder().encode('#!/bin/sh\necho "kettle 1.2.3"\n');
  const packed = Bun.spawnSync(['bzip2', '-c'], { stdin: script }).stdout;
  const sha256 = new Bun.CryptoHasher('sha256').update(packed).digest('hex');
  const tools = { kettle: { url: 'https://example.com/kettle.bz2', sha256, unpack: 'bz2', folder: '', version: ['kettle'] } } as const;
  const version = await installTool('kettle', { tools, download: () => Promise.resolve(packed), into: ctx.directory, githubPath });

  expect(version).toBe('kettle 1.2.3');
  expect(readFileSync(githubPath, 'utf8')).toBe(`${join(ctx.directory, 'kettle')}\n`);
});

test('it rejects a tool name it has no pin for', () => {
  const ctx = setupTest();

  expect(installTool('teapot', { tools: TOOLS, download: () => Promise.resolve(ctx.kettle), into: ctx.directory, githubPath: '' })).rejects.toThrow('install-tool: name one of shellcheck, gitleaks, restic, not "teapot"');
});
