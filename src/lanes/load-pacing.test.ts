import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPacing } from './load-pacing.ts';

// A pacing.json path in a folder of its own, gone when the test ends; no file is written.
function setupTest(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hq-pacing-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'pacing.json');
}

// Writes `pacing` to `path` and returns the path.
function writePacing(path: string, pacing: unknown): string {
  writeFileSync(path, JSON.stringify(pacing));
  return path;
}

test('no file gives one pool of imp slots and no error', async () => {
  const pacing = await loadPacing(setupTest());
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: null, error: null });
});

test('a file with no lanes gives one pool of imp slots and no error', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { imp: { impMib: 4096 } }));
  expect(pacing).toStrictEqual({ impMib: 4096, lanes: null, error: null });
});

test('a lends key is read past, no longer refused', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { lanes: { imp: { cleanup: 2, atc: 1 }, local: {} }, lends: { teapot: false } }));
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: [{ name: 'cleanup', place: 'imp', size: 2 }, { name: 'atc', place: 'imp', size: 1 }], error: null });
});

test('a lane pacing.json gets wrong is an error, so the watcher nudges nothing', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { lanes: { imp: { 'Bad Teapot': 2 }, local: {} } }));
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: null, error: 'pacing.json: pacing.json lanes: bad lane imp.Bad Teapot' });
});
