import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubStoreQuery } from './build-stub-store-query.ts';
import { createStubNoslopStore } from './create-stub-noslop-store.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-stub-query-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return {
    openStore: () => {
      const db = new Database(join(dir, 'store.sqlite'), { readonly: true });
      onTestFinished(() => db.close());
      return db;
    },
    store: join(dir, 'store.sqlite'),
  };
}

test('it applies its statements to the store and answers an empty success', () => {
  const ctx = setupTest();
  createStubNoslopStore(ctx.store, { migrations: ['0001-a'], tables: {} });

  expect(buildStubStoreQuery(ctx.store, ["INSERT INTO kysely_migration (name, timestamp) VALUES ('0002-b', 'now')"])()).toStrictEqual({ code: 0, stdout: '[]', stderr: '' });

  expect(ctx.openStore().query('SELECT name FROM kysely_migration ORDER BY name').all()).toStrictEqual([{ name: '0001-a' }, { name: '0002-b' }]);
});
