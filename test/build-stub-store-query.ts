import { Database } from 'bun:sqlite';
import type { RunResult } from '../src/runner/types.ts';

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
