export interface StoreDisposition {
  repo: string;
  finding_id: string;
  kind: string;
  value: string;
  author: string;
  author_is_owner: number;
  source: string;
  at: string;
  pull_request: number;
}

export function buildMockStoreDisposition(overrides: Partial<StoreDisposition> = {}): StoreDisposition {
  return { repo: 'zgeoff/hq', finding_id: 'f1', kind: 'fixed', value: 'x', author: 'a', author_is_owner: 1, source: 's', at: '2026-10-01T00:00:00Z', pull_request: 1, ...overrides };
}
