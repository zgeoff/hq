import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubNoslopStore } from './create-stub-noslop-store.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-stub-store-'));

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

test('it makes a store holding the migrations and the rows asked for', () => {
  const ctx = setupTest();

  createStubNoslopStore(ctx.store, { migrations: ['0001-a', '0002-b'], tables: { kettles: 3, teapots: 0 } });

  expect(ctx.openStore().query('SELECT name FROM kysely_migration ORDER BY name').all()).toStrictEqual([{ name: '0001-a' }, { name: '0002-b' }]);
  expect(ctx.openStore().query('SELECT COUNT(*) AS n FROM kettles').get()).toStrictEqual({ n: 3 });
  expect(ctx.openStore().query('SELECT COUNT(*) AS n FROM teapots').get()).toStrictEqual({ n: 0 });
});
