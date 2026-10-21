import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { setMeta } from '../db/set-meta.ts';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import { readTreeCheck } from './read-tree-check.ts';
import { runTreeSyncTick } from './run-tree-sync-tick.ts';

test('it turns the private-tree health check red with no checkout, and says how to set it up', () => {
  const ctx = createTreeFixture();
  expect(readTreeCheck(ctx.db, new Date())).toBeNull();
  expect(readTreeCheck(ctx.db, new Date(), 'private')).toStrictEqual({
    key: 'private-tree',
    ok: false,
    line: `hq-private: no checkout at ${PRIVATE_TREE.dir()} (hq defs setup private); start prompts can't be read without it`,
  });
});

test('it holds hq-private to the same 30-minute rule as hq-defs, and prefixes its lines', () => {
  const ctx = createTreeFixture(),
    later = new Date(Date.now() + 31 * 60_000);
  ctx.createPrivate();
  expect(readTreeCheck(ctx.db, new Date(), 'private')).toStrictEqual({
    key: 'private-tree',
    ok: false,
    line: 'hq-private: never synced (the hq-lanes watcher syncs it each tick; hq defs sync)',
  });
  runTreeSyncTick(ctx.db, 'hq-lanes', 'private');
  expect(readTreeCheck(ctx.db, new Date(), 'private')).toMatchObject({ key: 'private-tree', ok: true, line: expect.stringMatching(/^hq-private: .* is on origin\/main/u) });
  expect(readTreeCheck(ctx.db, later, 'private')).toMatchObject({ ok: false, line: expect.stringContaining('hq-private: last synced') });
  setMeta(ctx.db, 'private_tree_sync', 'not json {');
  expect(readTreeCheck(ctx.db, new Date(), 'private')).toMatchObject({ ok: false, line: 'hq-private: the last sync record is unreadable; hq defs sync writes a new one' });
});
