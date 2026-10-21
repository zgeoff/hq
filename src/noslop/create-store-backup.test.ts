import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubNoslopStore } from '../../test/create-stub-noslop-store.ts';
import { createStoreBackup } from './create-store-backup.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-store-backup-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return {
    dir,
    openCopy: (path: string) => {
      const copy = new Database(path, { readonly: true });
      onTestFinished(() => copy.close());
      return copy;
    },
    store: join(dir, 'store.sqlite'),
  };
}

test('it copies the store beside it under a name with the sha and the time, and the copy passes its integrity check', () => {
  const ctx = setupTest();
  createStubNoslopStore(ctx.store, { migrations: ['0001-a'], tables: { kettles: 4 } });

  expect(createStoreBackup(ctx.store, '0123456', '20261020T010203Z')).toBe(`${ctx.store}.bak-0123456-20261020T010203Z`);

  expect(ctx.openCopy(`${ctx.store}.bak-0123456-20261020T010203Z`).query('PRAGMA integrity_check').all()).toStrictEqual([{ integrity_check: 'ok' }]);
  expect(ctx.openCopy(`${ctx.store}.bak-0123456-20261020T010203Z`).query('SELECT COUNT(*) AS n FROM kettles').get()).toStrictEqual({ n: 4 });
});

test('it refuses a store file that is not a database', () => {
  const ctx = setupTest();
  writeFileSync(ctx.store, 'not a database, only invented text, long enough to be a bad header for sqlite to refuse');

  expect(() => createStoreBackup(ctx.store, '0123456', '20261020T010203Z')).toThrow(/hq cannot back up the store/u);
});
