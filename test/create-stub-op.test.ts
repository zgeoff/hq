import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubOp } from './create-stub-op.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-stub-op-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it prints the answer for a reference in its table and exits 0', () => {
  const ctx = setupTest();
  const stub = createStubOp({ directory: ctx.directory, answers: { 'op://kettle-vault/teapot-item/credential': 'sk-ant-kettle-stub-0001' } });

  const read = Bun.spawnSync([join(stub.bin, 'op'), 'read', 'op://kettle-vault/teapot-item/credential']);

  expect({ code: read.exitCode, stdout: read.stdout.toString(), stderr: read.stderr.toString() }).toStrictEqual({ code: 0, stdout: 'sk-ant-kettle-stub-0001\n', stderr: '' });
});

test('it fails with exit 1, a message on stderr and nothing on stdout for a reference not in its table', () => {
  const ctx = setupTest();
  const stub = createStubOp({ directory: ctx.directory, answers: { 'op://kettle-vault/teapot-item/credential': 'sk-ant-kettle-stub-0001' } });

  const read = Bun.spawnSync([join(stub.bin, 'op'), 'read', 'op://kettle-vault/other-item/credential']);

  expect({ code: read.exitCode, stdout: read.stdout.toString(), stderr: read.stderr.toString() }).toStrictEqual({ code: 1, stdout: '', stderr: '[ERROR] could not read the secret: invented: no such item\n' });
});

test('it fails a command other than read', () => {
  const ctx = setupTest();
  const stub = createStubOp({ directory: ctx.directory, answers: { 'op://kettle-vault/teapot-item/credential': 'sk-ant-kettle-stub-0001' } });

  const listed = Bun.spawnSync([join(stub.bin, 'op'), 'item', 'list']);

  expect(listed.exitCode).toBe(1);
  expect(listed.stdout.toString()).toBe('');
});

test('it is the op a shell finds when its directory leads PATH', () => {
  const ctx = setupTest();
  const stub = createStubOp({ directory: ctx.directory, answers: {} });

  const found = Bun.spawnSync(['sh', '-c', 'command -v op'], { env: { PATH: `${stub.bin}:/usr/bin:/bin` } });

  expect(found.stdout.toString()).toBe(`${join(stub.bin, 'op')}\n`);
});
