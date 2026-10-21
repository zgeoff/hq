import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { INTAKE, buildPrompt, createTreeFixture } from '../../test/create-tree-fixture.ts';
import { PRIVATE_TREE } from './private-tree.ts';
import { readPrompt } from './read-prompt.ts';
import { resetFetchCache } from './reset-fetch-cache.ts';

test('it reads a start prompt from origin/main of hq-private after a fetch, never from the working tree', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  writeFileSync(`${tree.dir}/${INTAKE}`, buildPrompt('unmerged edit'));
  expect(readPrompt(`main:${INTAKE}`)).toBe('You are an invented intake.');
  tree.writeCommit({ [INTAKE]: buildPrompt('intake two') });
  resetFetchCache();
  expect(readPrompt(`main:${INTAKE}`)).toBe('You are an invented intake two.');
});

test('it refuses a prompt hq-private lacks, even when hq-defs holds it, and names hq-private and the path', () => {
  const ctx = createTreeFixture(),
    path = 'skills/only-in-defs/references/session-prompt.md';
  ctx.createHq({ [path]: buildPrompt('only in defs') });
  ctx.createPrivate();
  expect(() => readPrompt(`main:${path}`)).toThrow(`can't read ${path} from origin/main in ${PRIVATE_TREE.dir()}`);
  expect(() => readPrompt(`main:${path}`)).toThrow('hq refuses to use the working tree');
});

test('it refuses every prompt when hq-private is not cloned, even with hq-defs in place', () => {
  const ctx = createTreeFixture();
  ctx.createHq({ [INTAKE]: buildPrompt('intake in defs') });
  expect(() => readPrompt(`main:${INTAKE}`)).toThrow(`${PRIVATE_TREE.dir()} is not a checkout (hq defs setup private)`);
});

test('it refuses a prompt when the fetch of hq-private fails, and uses no old fetch', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  tree.git('config', '--unset-all', `url.${tree.origin}.insteadOf`);
  tree.git('remote', 'set-url', 'origin', `${ctx.dir}/no-such-origin`);
  expect(() => readPrompt(`main:${INTAKE}`)).toThrow(`can't fetch main in ${PRIVATE_TREE.dir()} to read ${INTAKE}`);
});
