import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateEnv } from '@zgeoff/testing/helpers';
import { freshDb } from '../../test/helpers.ts';
import { readRefusalFiles } from './read-refusal-files.ts';
import { scanRefusals } from './scan-refusals.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, projects: join(fresh.dir, 'projects') };
}

test('it reads the scan state of every transcript scanned, ordered by path', async () => {
  const ctx = setupTest();
  const written = new Date('2026-10-21T22:00:00Z');
  mkdirSync(join(ctx.projects, 'kettle'), { recursive: true });
  writeFileSync(join(ctx.projects, 'kettle', 'b.jsonl'), '{"type":"user","uuid":"00000000-0000-4000-8000-000000000001"}\n');
  writeFileSync(join(ctx.projects, 'kettle', 'a.jsonl'), '{"type":"user","uuid":"00000000-0000-4000-8000-000000000002"}\n{"type":"user","uuid":"00000000-0000-4000-8000-000000000003"}\n');
  utimesSync(join(ctx.projects, 'kettle', 'a.jsonl'), written, written);
  utimesSync(join(ctx.projects, 'kettle', 'b.jsonl'), written, written);
  updateEnv('HQ_NOW', '2026-10-22T00:00:00Z');
  await scanRefusals(ctx.db, { dir: ctx.projects, sessions: async () => [] });

  expect(readRefusalFiles(ctx.db)).toStrictEqual([
    { path: join(ctx.projects, 'kettle', 'a.jsonl'), offset: 124, size: 124, mtime: '2026-10-21T22:00:00Z', tools: '[]' },
    { path: join(ctx.projects, 'kettle', 'b.jsonl'), offset: 62, size: 62, mtime: '2026-10-21T22:00:00Z', tools: '[]' },
  ]);
});

test('it reads no rows before the first scan', () => {
  const ctx = setupTest();

  expect(readRefusalFiles(ctx.db)).toStrictEqual([]);
});
