import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { freshDb } from '../../test/helpers.ts';
import type { Install, Spawn } from './run-deps-install.ts';
import { runBunInstall, runDepsInstall } from './run-deps-install.ts';

function setupTest() {
  const fresh = freshDb();
  const directory = `${fresh.dir}/hq-defs`;

  onTestFinished(fresh.cleanup);
  mkdirSync(directory);

  return {
    db: fresh.db,
    directory,
    installed: mock<Install>(() => ({ code: 0, err: '' })),
    failed: mock<Install>(() => ({ code: 1, err: 'invented lockfile mismatch' })),
  };
}

test('it installs when node_modules is missing, and not again while bun.lock stays the same', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1}\n');

  const first = runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.installed);
  mkdirSync(`${ctx.directory}/node_modules`);
  const second = runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.installed);

  expect(first).toStrictEqual({ ok: true, line: 'installed its dependencies' });
  expect(second).toBeNull();
  expect(ctx.installed.mock.calls).toStrictEqual([[ctx.directory]]);
  expect(ctx.db.query(`SELECT action FROM events WHERE subject_id = 'defs'`).all()).toStrictEqual([{ action: 'deps-installed' }]);
});

test('it installs again when bun.lock changes', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1}\n');
  mkdirSync(`${ctx.directory}/node_modules`);
  runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.installed);
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1, "packages": {}}\n');

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.installed)).toStrictEqual({ ok: true, line: 'installed its dependencies' });
  expect(ctx.installed.mock.calls).toHaveLength(2);
});

test('it reports a failed install and tries again on the next call', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1}\n');

  mkdirSync(`${ctx.directory}/node_modules`);

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.failed)).toStrictEqual({ ok: false, line: 'bun install failed (1): invented lockfile mismatch' });
  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.installed)).toStrictEqual({ ok: true, line: 'installed its dependencies' });
  expect(ctx.installed.mock.calls).toHaveLength(1);
  expect(ctx.db.query(`SELECT action FROM events WHERE subject_id = 'defs' ORDER BY seq`).all()).toStrictEqual([{ action: 'deps-install-failed' }, { action: 'deps-installed' }]);
});

test('it does nothing in a checkout with no bun.lock', () => {
  const ctx = setupTest();

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.installed)).toBeNull();
  expect(ctx.installed.mock.calls).toStrictEqual([]);
});

test('it installs with the lockfile frozen and every lifecycle script off', () => {
  const ctx = setupTest();
  const spawn = mock<Spawn>(() => ({ exitCode: 0, stderr: Buffer.from('') }));

  expect(runBunInstall(ctx.directory, spawn)).toStrictEqual({ code: 0, err: '' });
  expect(spawn.mock.calls).toStrictEqual([[['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], { cwd: ctx.directory, timeout: 300_000 }]]);
});
