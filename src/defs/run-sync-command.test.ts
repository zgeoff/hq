import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { runSyncCommand } from './run-sync-command.ts';

test('it fails with the refused tree named when one tree cannot be fast-forwarded', () => {
  const ctx = createTreeFixture(),
    tree = ctx.createPrivate();
  ctx.createHq();
  tree.git('remote', 'set-url', 'origin', 'git@github.com:zgeoff/hq.git');
  expect(() => runSyncCommand(ctx.db, 'z-q')).toThrow(
    expect.objectContaining({
      code: 'not_synced',
      message: expect.stringContaining('not zgeoff/hq-private'),
    }),
  );
});
