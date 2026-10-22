import { expect, test } from 'bun:test';
import { renameSync } from 'node:fs';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { readFetchCheck } from './read-fetch-check.ts';

test('it is green when hq-private fetches, whatever hq-defs does', () => {
  const ctx = createTreeFixture(),
    trees = ctx.createBoth();
  renameSync(trees.hq.origin, `${trees.hq.origin}-gone`);
  expect(readFetchCheck(ctx.db)).toMatchObject({ key: 'defs-fetch', ok: true, line: expect.stringContaining('hq-private main fetches') });
});

test('it is red when hq-private cannot fetch, though hq-defs can', () => {
  const ctx = createTreeFixture(),
    trees = ctx.createBoth();
  renameSync(trees.private.origin, `${trees.private.origin}-gone`);
  expect(readFetchCheck(ctx.db)).toMatchObject({ key: 'defs-fetch', ok: false, line: expect.stringContaining("can't fetch hq-private main") });
});
