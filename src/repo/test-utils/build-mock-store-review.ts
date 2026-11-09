export interface StoreReview {
  review_id: string;
  repo: string;
  pull_request: number;
  base: string;
  head: string;
  depth: string;
  risk_classes: string;
  lenses: string;
  config_hash: string;
  started_at: string;
  ended_at: string;
}

export function buildMockStoreReview(overrides: Partial<StoreReview> = {}): StoreReview {
  return {
    review_id: 'r1',
    repo: 'zgeoff/widgets',
    pull_request: 7,
    base: 'main',
    head: 'feat',
    depth: 'standard',
    risk_classes: '[]',
    lenses: '[]',
    config_hash: 'c1',
    started_at: '2026-10-01T00:00:00Z',
    ended_at: '2026-10-01T00:01:00Z',
    ...overrides,
  };
}
