import { Database } from 'bun:sqlite';
import type { RunResult } from '../src/runner/types.ts';

// What `noslop store query` does to the store, as the runner's answer: runs the statements on the
// store, the way a migration would, and answers an empty result.
export function buildStubStoreQuery(store: string, statements: string[]): () => RunResult {
  return () => {
    const db = new Database(store);
    for (const statement of statements) {
      db.run(statement);
    }
    db.close();
    return { code: 0, stdout: '[]', stderr: '' };
  };
}
