import { expect, test } from 'bun:test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { createTreeCheckout } from '../../test/create-tree-checkout.ts';
import { INTAKE, buildPrompt, createTreeFixture } from '../../test/create-tree-fixture.ts';
import { getMeta } from '../db/get-meta.ts';
import { runTreeSyncTick } from './run-tree-sync-tick.ts';
import { runTreeSync } from './run-tree-sync.ts';

type Checkout = ReturnType<typeof createTreeCheckout>;

test('it fast-forwards hq-private, records it under its own key, and logs the tree', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  expect(runTreeSync('private')).toMatchObject({ ok: true, changed: false, line: expect.stringContaining('is on origin/main') });
  tree.writeCommit({ [INTAKE]: buildPrompt('intake two') });
  expect(runTreeSyncTick(ctx.db, 'hq-lanes', 'private')).toMatchObject({ ok: true, changed: true, line: expect.stringContaining('fast-forwarded') });
  expect(readFileSync(`${tree.dir}/${INTAKE}`, 'utf8')).toBe(buildPrompt('intake two'));
  expect(getMeta(ctx.db, 'private_tree_sync')).toBeString();
  expect(getMeta(ctx.db, 'defs_tree_sync')).toBeNull();
  expect(ctx.db.query(`SELECT actor, data FROM events WHERE action = 'tree-forwarded'`).all()).toMatchObject([{ actor: 'hq-lanes', data: expect.stringContaining('"tree":"private"') }]);
});

test('it does nothing for a tree with no checkout', () => {
  createTreeFixture();
  expect(runTreeSync('private')).toBeNull();
  expect(runTreeSync('hq')).toBeNull();
});

test.each([
  ['a dirty tree', (tree: Checkout) => appendFileSync(`${tree.dir}/${INTAKE}`, ' '), 'dirty (1 changed file(s))'],
  ['another branch', (tree: Checkout) => tree.git('checkout', '-q', '-b', 'side'), 'on branch side, not main'],
  ['a local commit', (tree: Checkout) => tree.git('commit', '-q', '--allow-empty', '-m', 'local'), 'has commits origin/main'],
  ["hq's own origin", (tree: Checkout) => tree.git('remote', 'set-url', 'origin', 'git@github.com:zgeoff/hq.git'), 'not zgeoff/hq-private'],
])('it refuses to fast-forward hq-private with %s, and leaves its files as they were', (_name, spoil, why) => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  tree.writeCommit({ 'skills/intake/SKILL.md': 'upstream\n' });
  spoil(tree);
  expect(runTreeSync('private')).toMatchObject({ ok: false, changed: false, line: expect.stringContaining(why) });
  expect(existsSync(`${tree.dir}/skills/intake/SKILL.md`)).toBe(false);
});

test('it retries a ref lock in hq-private, and goes red on the second tick in a row, under its own key', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  tree.writeCommit({ 'skills/intake/SKILL.md': 'upstream\n' });
  writeFileSync(`${tree.dir}/.git/refs/remotes/origin/main.lock`, '');
  expect(runTreeSyncTick(ctx.db, 'hq-lanes', 'private')).toMatchObject({ ok: true, transient: true });
  expect(runTreeSyncTick(ctx.db, 'hq-lanes', 'private')).toMatchObject({ ok: false, line: expect.stringContaining('the same on the tick before') });
  expect(getMeta(ctx.db, 'defs_tree_sync')).toBeNull();
});

test('it puts a clean detached tree back on main and fast-forwards it, and logs the re-attach', () => {
  const ctx = createTreeFixture();
  const tree = ctx.createPrivate();
  tree.git('checkout', '-q', '--detach');
  tree.writeCommit({ 'skills/intake/SKILL.md': 'upstream\n' });
  expect(runTreeSyncTick(ctx.db, 'hq-lanes', 'private')).toMatchObject({ ok: true, changed: true, line: expect.stringContaining('re-attached to main from detached') });
  expect(tree.git('symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(tree.git('rev-parse', 'HEAD')).toBe(tree.git('rev-parse', 'origin/main'));
  expect(readFileSync(`${tree.dir}/skills/intake/SKILL.md`, 'utf8')).toBe('upstream\n');
  expect(ctx.db.query(`SELECT action FROM events WHERE action LIKE 'tree-%' ORDER BY seq`).all()).toStrictEqual([{ action: 'tree-reattached' }, { action: 'tree-forwarded' }]);
});

test('it re-attaches a clean detached tree that is already on origin/main', () => {
  const ctx = createTreeFixture();
  const tree = ctx.createPrivate();
  tree.git('checkout', '-q', '--detach');
  expect(runTreeSync('private')).toMatchObject({ ok: true, changed: false, reattached: expect.any(String), line: expect.stringContaining('is on origin/main') });
  expect(tree.git('symbolic-ref', '--short', 'HEAD')).toBe('main');
});

test('it logs a re-attach whose fast-forward git refused as re-attached, not as forwarded', () => {
  const ctx = createTreeFixture();
  const tree = ctx.createPrivate();
  tree.git('checkout', '-q', '--detach');
  tree.writeCommit({ 'skills/kettle/SKILL.md': 'upstream\n' });
  mkdirSync(`${tree.dir}/skills/kettle`, { recursive: true });
  writeFileSync(`${tree.dir}/skills/kettle/SKILL.md`, 'local and untracked\n');

  const result = runTreeSyncTick(ctx.db, 'hq-lanes', 'private');

  expect(result).toMatchObject({ ok: false, changed: false, reattached: expect.any(String), line: expect.stringContaining('git merge --ff-only failed') });
  expect(tree.git('symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(ctx.db.query(`SELECT action FROM events WHERE action LIKE 'tree-%'`).all()).toStrictEqual([{ action: 'tree-reattached' }]);
});

test('it reports a detached tree with local changes, and leaves it detached and dirty', () => {
  const ctx = createTreeFixture();
  const tree = ctx.createPrivate();
  tree.git('checkout', '-q', '--detach');
  appendFileSync(`${tree.dir}/${INTAKE}`, ' ');
  expect(runTreeSync('private')).toMatchObject({ ok: false, changed: false, line: expect.stringContaining('HEAD is detached') });
  expect(tree.git('branch', '--show-current')).toBe('');
  expect(tree.git('status', '--porcelain')).toBe(`M ${INTAKE}`);
});

test('it reports a detached tree on a commit origin/main lacks, and leaves HEAD where it was', () => {
  const ctx = createTreeFixture();
  const tree = ctx.createPrivate();
  tree.git('checkout', '-q', '--detach');
  tree.git('commit', '-q', '--allow-empty', '-m', 'stray');
  const head = tree.git('rev-parse', 'HEAD');
  expect(runTreeSync('private')).toMatchObject({ ok: false, changed: false, line: expect.stringContaining('HEAD is detached') });
  expect(tree.git('rev-parse', 'HEAD')).toBe(head);
  expect(tree.git('branch', '--show-current')).toBe('');
});

test('it reports a detached tree when local main is ahead of origin/main, and leaves both alone', () => {
  const ctx = createTreeFixture();
  const tree = ctx.createPrivate();
  tree.git('commit', '-q', '--allow-empty', '-m', 'local');
  const main = tree.git('rev-parse', 'main');
  tree.git('checkout', '-q', '--detach', 'HEAD~1');
  const head = tree.git('rev-parse', 'HEAD');
  expect(runTreeSync('private')).toMatchObject({ ok: false, changed: false, line: expect.stringContaining('HEAD is detached') });
  expect(tree.git('rev-parse', 'HEAD')).toBe(head);
  expect(tree.git('rev-parse', 'main')).toBe(main);
  expect(tree.git('branch', '--show-current')).toBe('');
});
