import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { DEFS_SOURCES } from '../prompts/defs-sources.ts';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import { parseTree } from './parse-tree.ts';

test('it keeps hq-private beside hq-defs, named by HQ_PRIVATE_DIR, and out of the sources hq defs use can pick', () => {
  const ctx = createTreeFixture();
  expect(PRIVATE_TREE.dir()).toBe(`${ctx.dir}/.local/share/atc/workspaces/hq-private`);
  expect(PRIVATE_TREE.repo).toBe('zgeoff/hq-private');
  expect(Object.keys(DEFS_SOURCES)).toStrictEqual(['hq']);
});

test.each(['hq', 'private'] as const)('it takes the tree name %s', (name) => {
  expect(parseTree(name)).toBe(name);
});

test.each(['', 'hq-private', 'hq-defs', '__proto__', 'toString'])('it refuses the tree name %p', (name) => {
  expect(() => parseTree(name)).toThrow('the tree must be hq or private');
});
