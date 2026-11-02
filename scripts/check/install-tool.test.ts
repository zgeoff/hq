import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import { TOOLS, checkDigest, unpackTool } from './install-tool.ts';

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
