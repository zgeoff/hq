import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedRefusalFile } from './seed-refusal-file.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readFiles: () => fresh.db.query('SELECT path, offset, size, mtime, tools FROM refusal_files ORDER BY path').all() };
}

test('#seedRefusalFile stores a scanned transcript, and input overrides apply', () => {
  const ctx = setupTest();

  seedRefusalFile(ctx, { path: '/u.jsonl', offset: 12 });

  expect(ctx.readFiles()).toStrictEqual([{ path: '/u.jsonl', offset: 12, size: 9, mtime: '2026-10-14T03:00:00Z', tools: '[]' }]);
});

test('#seedRefusalFile replaces the scan a path already holds', () => {
  const ctx = setupTest();
  seedRefusalFile(ctx, { path: '/u.jsonl', offset: 12 });

  seedRefusalFile(ctx, { path: '/u.jsonl', offset: 20 });

  expect(ctx.readFiles()).toMatchObject([{ path: '/u.jsonl', offset: 20 }]);
});
