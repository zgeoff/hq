import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { DEFS_SOURCES } from './defs-sources.ts';
import { PRIVATE_TREE } from './private-tree.ts';
import { runMainFetch } from './run-main-fetch.ts';

test('it keeps the once-a-minute fetch cache per tree, so a fetch of one never stands in for the other', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  ctx.createHq();
  expect(runMainFetch(DEFS_SOURCES.hq.dir())).toBeNull();
  tree.git('config', '--unset-all', `url.${tree.origin}.insteadOf`);
  tree.git('remote', 'set-url', 'origin', `${ctx.dir}/no-such-origin`);
  expect(runMainFetch(PRIVATE_TREE.dir())).toContain('git fetch failed');
  expect(runMainFetch(DEFS_SOURCES.hq.dir())).toBeNull();
  expect(runMainFetch(PRIVATE_TREE.dir())).toContain('git fetch failed');
});

test('it answers a second call within the minute with a failed fetch, though the remote works again', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  {
    const remote = tree.git('config', '--get', 'remote.origin.url');
    tree.git('remote', 'set-url', 'origin', `${ctx.dir}/no-such-origin`);
    {
      const failed = runMainFetch(PRIVATE_TREE.dir());
      tree.git('remote', 'set-url', 'origin', remote);
      expect(runMainFetch(PRIVATE_TREE.dir())).toBe(failed);
      expect(failed).toContain('git fetch failed');
    }
  }
});

test('it answers a second call within the minute with a good fetch, though the remote is broken since', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  {
    const fetched = runMainFetch(PRIVATE_TREE.dir());
    tree.git('remote', 'set-url', 'origin', `${ctx.dir}/no-such-origin`);
    expect(runMainFetch(PRIVATE_TREE.dir())).toBeNull();
    expect(fetched).toBeNull();
  }
});
