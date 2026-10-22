import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { freshDb } from '../../test/helpers.ts';
import { runDepsInstall } from './run-deps-install.ts';

function setupTest() {
  const fresh = freshDb();
  const directory = `${fresh.dir}/hq-defs`;
  const installs: string[] = [];

  onTestFinished(fresh.cleanup);
  mkdirSync(directory);

  return {
    db: fresh.db,
    directory,
    installs,
    install: (code: number) => (target: string) => {
      installs.push(target);
      if (code === 0) {
        mkdirSync(`${target}/node_modules`, { recursive: true });
      }
      return { code, err: code === 0 ? '' : 'invented lockfile mismatch' };
    },
  };
}

test('it installs when node_modules is missing, and not again while bun.lock stays the same', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1}\n');

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(0))).toStrictEqual({ ok: true, line: 'installed its dependencies' });
  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(0))).toBeNull();
  expect(ctx.installs).toStrictEqual([ctx.directory]);
  expect(ctx.db.query(`SELECT action FROM events WHERE subject_id = 'defs'`).all()).toStrictEqual([{ action: 'deps-installed' }]);
});

test('it installs again when bun.lock changes', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1}\n');
  runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(0));
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1, "packages": {}}\n');

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(0))).toStrictEqual({ ok: true, line: 'installed its dependencies' });
  expect(ctx.installs).toHaveLength(2);
});

test('it reports a failed install and tries again on the next call', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bun.lock`, '{"lockfileVersion": 1}\n');

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(1))).toStrictEqual({ ok: false, line: 'bun install failed (1): invented lockfile mismatch' });
  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(0))).toStrictEqual({ ok: true, line: 'installed its dependencies' });
  expect(ctx.installs).toHaveLength(2);
  expect(ctx.db.query(`SELECT action FROM events WHERE subject_id = 'defs' ORDER BY seq`).all()).toStrictEqual([{ action: 'deps-install-failed' }, { action: 'deps-installed' }]);
});

test('it does nothing in a checkout with no bun.lock', () => {
  const ctx = setupTest();

  expect(runDepsInstall(ctx.db, ctx.directory, 'hq-lanes', ctx.install(0))).toBeNull();
  expect(ctx.installs).toStrictEqual([]);
});
