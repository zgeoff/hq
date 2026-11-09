import { Database } from 'bun:sqlite';
import { buildMockStoreDisposition } from './build-mock-store-disposition.ts';
import type { StoreDisposition } from './build-mock-store-disposition.ts';
import type { RepoDeps } from './types.ts';

export function seedStoreDisposition(deps: RepoDeps, input: Partial<StoreDisposition> = {}): StoreDisposition {
  const disposition = buildMockStoreDisposition(input);
  const store = new Database(deps.store);
  try {
    // A finding's disposition from the review store, which the noslop tool writes and no code in this repo does.
    store
      .query('INSERT INTO dispositions (repo, finding_id, kind, value, author, author_is_owner, source, at, pull_request) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(disposition.repo, disposition.finding_id, disposition.kind, disposition.value, disposition.author, disposition.author_is_owner, disposition.source, disposition.at, disposition.pull_request);
  } finally {
    store.close();
  }

  return disposition;
}
