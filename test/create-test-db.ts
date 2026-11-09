import { onTestFinished } from 'bun:test';
import { freshDb } from './helpers.ts';

export function createTestDb(): ReturnType<typeof freshDb> {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return fresh;
}
