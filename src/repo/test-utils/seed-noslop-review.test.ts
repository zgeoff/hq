import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createStoreTables } from '../../../test/create-history-databases.ts';
import { freshDb } from '../../../test/helpers.ts';
import { seedNoslopReview } from './seed-noslop-review.ts';

function setupTest() {
  const base = freshDb();
  const store = `${base.dir}/store.sqlite`;
  onTestFinished(base.cleanup);
  createStoreTables(store);
  return {
    store,
    readReviews: () => {
      const copy = new Database(store, { readonly: true });
      onTestFinished(() => copy.close());
      return copy.query('SELECT review_id, repo, pull_request, head FROM reviews ORDER BY review_id').all();
    },
  };
}

test('#seedNoslopReview puts a review in the review store, and input overrides apply', () => {
  const ctx = setupTest();

  seedNoslopReview(ctx, { review_id: 'r0', head: 'h2' });

  expect(ctx.readReviews()).toStrictEqual([{ review_id: 'r0', repo: 'zgeoff/widgets', pull_request: 7, head: 'h2' }]);
});
