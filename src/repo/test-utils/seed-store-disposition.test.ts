import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createStoreTables } from '../../../test/create-history-databases.ts';
import { freshDb } from '../../../test/helpers.ts';
import { seedStoreDisposition } from './seed-store-disposition.ts';

function setupTest() {
  const base = freshDb();
  const store = `${base.dir}/xdg/noslop/store.sqlite`;
  onTestFinished(base.cleanup);
  createStoreTables(store);
  return {
    store,
    readDispositions: () => {
      const copy = new Database(store, { readonly: true });
      onTestFinished(() => copy.close());
      return copy.query('SELECT repo, finding_id, kind, source, at, pull_request FROM dispositions ORDER BY pull_request').all();
    },
  };
}

test('#seedStoreDisposition stores a disposition in the review store, and input overrides apply', () => {
  const ctx = setupTest();

  seedStoreDisposition(ctx, { pull_request: 2, source: 'review-2' });

  expect(ctx.readDispositions()).toStrictEqual([{ repo: 'zgeoff/hq', finding_id: 'f1', kind: 'fixed', source: 'review-2', at: '2026-10-01T00:00:00Z', pull_request: 2 }]);
});

test('#seedStoreDisposition keeps each disposition it stores', () => {
  const ctx = setupTest();

  seedStoreDisposition(ctx, { pull_request: 1 });
  seedStoreDisposition(ctx, { pull_request: 2 });

  expect(ctx.readDispositions()).toMatchObject([{ pull_request: 1 }, { pull_request: 2 }]);
});
