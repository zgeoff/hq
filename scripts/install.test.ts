import { expect, onTestFinished, test } from 'bun:test';
import { appendFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

// Each build runs in a clone of this checkout, so a test can dirty or drop the tree without
// touching the checkout itself.
function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-install-'));
  const repo = resolve(import.meta.dir, '..');
  const tree = join(directory, 'tree');
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  Bun.spawnSync(['git', 'clone', '-q', '--no-hardlinks', repo, tree]);
  symlinkSync(join(repo, 'node_modules'), join(tree, 'node_modules'));

  // .gitignore names node_modules/, which matches no symlink; without this the clean tree reads dirty.
  appendFileSync(join(tree, '.git/info/exclude'), 'node_modules\n');
  return {
    directory,
    tree,
    head: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: tree }).stdout.toString().trim(),
    readBuiltVersion: () => {
      const out = join(directory, 'hq');
      const built = Bun.spawnSync(['sh', 'scripts/install.sh'], { cwd: tree, env: { ...process.env, HQ_INSTALL_OUT: out }, stderr: 'pipe' });
      expect(built.exitCode).toBe(0);
      const parsed: unknown = JSON.parse(Bun.spawnSync([out, 'version', '--json']).stdout.toString());
      return parsed;
    },
  };
}

test('it builds a binary that names the clean commit it was built from', () => {
  const ctx = setupTest();
  expect(ctx.readBuiltVersion()).toMatchObject({ commit: ctx.head, dirty: false });
});

test('it marks a build from a tree with uncommitted changes as dirty', () => {
  const ctx = setupTest();
  appendFileSync(join(ctx.tree, 'README.md'), '\nAn invented local edit.\n');
  expect(ctx.readBuiltVersion()).toMatchObject({ commit: ctx.head, dirty: true });
});

test('it marks a build outside git as installed from an unknown, dirty commit, so it ignores HQ_NOW', () => {
  const ctx = setupTest();
  rmSync(join(ctx.tree, '.git'), { recursive: true, force: true });
  expect(ctx.readBuiltVersion()).toMatchObject({ commit: 'unknown', dirty: true });
  const home = mkdtempSync(join(tmpdir(), 'hq-install-home-'));
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));

  const ran = Bun.spawnSync([join(ctx.directory, 'hq'), 'units', 'scrub', '--json'], {
    env: { ...process.env, HOME: home, HQ_DB: join(home, 'hq.db'), HQ_NOW: '2031-03-04T05:06:07Z' },
  });

  expect(ran.exitCode).toBe(0);
  expect(ran.stderr.toString()).toBe('hq: HQ_NOW is ignored in the installed hq\n');
});

test('it builds a binary that stamps a new item with the real time despite HQ_NOW, warns once each for HQ_NOW and HQ_QUIET, and keeps stdout JSON', () => {
  const ctx = setupTest();
  ctx.readBuiltVersion();
  const home = mkdtempSync(join(tmpdir(), 'hq-install-home-'));
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const before = Math.floor(Date.now() / 1000) * 1000;

  const ran = Bun.spawnSync([join(ctx.directory, 'hq'), 'unblock', 'add', '--id', 'descale', '--task', 'Descale the kettle', '--by', 'tester', '--json'], {
    env: { ...process.env, HOME: home, HQ_DB: join(home, 'hq.db'), HQ_NOW: '2031-03-04T05:06:07Z', HQ_QUIET: 'teapot' },
  });
  const after = Date.now();

  expect(ran.exitCode).toBe(0);
  expect(ran.stderr.toString()).toBe('hq: HQ_NOW is ignored in the installed hq\nhq: HQ_QUIET is ignored in the installed hq\n');
  const out = z.object({ ok: z.literal(true), item: z.object({ added_at: z.iso.datetime() }) }).parse(JSON.parse(ran.stdout.toString()));
  expect(Date.parse(out.item.added_at)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(out.item.added_at)).toBeLessThanOrEqual(after);
});
