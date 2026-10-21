import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../config/override-env.ts';
import { checkLiveUpgrade } from './check-live-upgrade.ts';
import { migrate } from './migrate.ts';
import { openDb } from './open-db.ts';
import { MIGRATIONS } from './migrations.ts';

// A database one schema behind this hq, in a scratch folder.
function setupTest(): Database {
  const scratch = mkdtempSync(join(tmpdir(), 'hq-live-upgrade-')),
    store = new Database(join(scratch, 'hq.db'), { create: true, strict: true });
  onTestFinished(() => {
    store.close();
    rmSync(scratch, { recursive: true, force: true });
  });
  migrate(store, store.filename, false, MIGRATIONS.slice(0, -1));
  return store;
}

test('a source run on the live database refuses a schema upgrade, leaves the schema as it was, and names both ways out', () => {
  const db = setupTest();

  expect(() => checkLiveUpgrade(db, true, MIGRATIONS.length, true)).toThrow(
    `hq.db is schema v${MIGRATIONS.length - 1} and this source run knows v${MIGRATIONS.length}: a source run never upgrades the live database. Install the build (bun run install-bin), or run it on a copy with HQ_DB=<path to a copy of hq.db>.`,
  );
  expect(db.query('PRAGMA user_version').get()).toStrictEqual({ user_version: MIGRATIONS.length - 1 });
});

test('an installed hq, or a source run on a copy, passes the same database', () => {
  const db = setupTest();

  expect(() => checkLiveUpgrade(db, true, MIGRATIONS.length, false)).not.toThrow();
});

test('openDb refuses to upgrade an older database in a source run with HQ_LIVE=1 and no HQ_DB', () => {
  const db = setupTest(),
    path = db.filename;
  onTestFinished(overrideEnv('HQ_LIVE', '1'));
  onTestFinished(overrideEnv('HQ_DB', undefined));
  db.close();

  expect(() => openDb(path)).toThrow('a source run never upgrades the live database');
  expect(new Database(path, { readonly: true }).query('PRAGMA user_version').get()).toStrictEqual({ user_version: MIGRATIONS.length - 1 });
});
