import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../config/override-env.ts';
import { realRunner } from '../runner/real-runner.ts';
import { readCapacity } from './read-capacity.ts';

// A skill folder whose capacity.sh prints room for imps; returns where its pacing.json goes.
function setupTest(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hq-capacity-')),
    script = join(dir, 'scripts', 'capacity.sh');
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(script, `echo '${JSON.stringify({ imp: { freeMib: 8192, room: true } })}'\n`);
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_CAPACITY', script));
  return join(dir, 'pacing.json');
}

test('a lane pacing.json gets wrong is the sample\'s error, though capacity read, so the watcher sends no fill nudge', async () => {
  writeFileSync(setupTest(), JSON.stringify({ lanes: { imp: { 'Bad Teapot': 2 }, local: {} } }));
  const sample = await readCapacity(realRunner);
  expect([sample.cap?.imp?.freeMib, sample.lanes, sample.error]).toStrictEqual([8192, null, 'pacing.json: pacing.json lanes: bad lane imp.Bad Teapot']);
});

test('good lanes read with capacity carry no error', async () => {
  writeFileSync(setupTest(), JSON.stringify({ lanes: { imp: { cleanup: 2 }, local: {} } }));
  const sample = await readCapacity(realRunner);
  expect([sample.lanes, sample.error]).toStrictEqual([[{ name: 'cleanup', place: 'imp', size: 2 }], null]);
});
