import { Database } from 'bun:sqlite';
import { buildMockStoreReview } from './build-mock-store-review.ts';
import type { StoreReview } from './build-mock-store-review.ts';
import type { RepoDeps } from './types.ts';

export function seedNoslopReview(deps: RepoDeps, input: Partial<StoreReview> = {}): StoreReview {
  const review = buildMockStoreReview(input);
  const store = new Database(deps.store);
  try {
    // A review in the review store, which the noslop tool writes and no code in this repo does.
    store
      .query('INSERT INTO reviews (review_id, repo, pull_request, base, head, depth, risk_classes, lenses, config_hash, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(review.review_id, review.repo, review.pull_request, review.base, review.head, review.depth, review.risk_classes, review.lenses, review.config_hash, review.started_at, review.ended_at);
  } finally {
    store.close();
  }

  return review;
}
