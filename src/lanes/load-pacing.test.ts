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
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: null, slots: null, error: null });
});

test('a file with no lanes gives one pool of imp slots and no error', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { imp: { impMib: 4096 } }));
  expect(pacing).toStrictEqual({ impMib: 4096, lanes: null, slots: null, error: null });
});

test('a lends key is read past, no longer refused', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { lanes: { imp: { cleanup: 2, atc: 1 }, local: {} }, lends: { teapot: false } }));
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: [{ name: 'cleanup', place: 'imp', size: 2 }, { name: 'atc', place: 'imp', size: 1 }], slots: { imp: 3, local: 0 }, error: null });
});

test('a lane pacing.json gets wrong is an error, so the watcher nudges nothing', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { lanes: { imp: { 'Bad Teapot': 2 }, local: {} } }));
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: null, slots: null, error: 'pacing.json: pacing.json lanes: bad lane imp.Bad Teapot' });
});

test('slots with no lanes give the slot caps, and one lane per place', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { slots: { imp: 6, local: 3 } }));
  expect(pacing).toStrictEqual({
    impMib: 2048,
    lanes: [
      { name: 'imp', place: 'imp', size: 6 },
      { name: 'local', place: 'local', size: 3 },
    ],
    slots: { imp: 6, local: 3 },
    error: null,
  });
});

test('slots set the caps over the lanes summed when the file gives both', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { slots: { imp: 4, local: 1 }, lanes: { imp: { kettle: 2 }, local: { teapot: 5 } } }));
  expect([pacing.lanes?.map((lane) => lane.name), pacing.slots]).toStrictEqual([['kettle', 'teapot'], { imp: 4, local: 1 }]);
});

test('slots pacing.json gets wrong are an error, so the watcher nudges nothing', async () => {
  const pacing = await loadPacing(writePacing(setupTest(), { slots: { imp: 2 } }));
  expect(pacing).toStrictEqual({ impMib: 2048, lanes: null, slots: null, error: 'pacing.json: pacing.json slots: give { imp: n, local: n }, each a whole number from 0 to 100' });
});
