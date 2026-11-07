import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildStubImpzRunner } from '../../test/build-stub-impz-runner.ts';
import { overrideEnv } from '../config/override-env.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { Runner } from '../runner/types.ts';
import { readCapacity } from './read-capacity.ts';

function setupTest(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hq-capacity-'));
  const script = join(directory, 'scripts', 'capacity.sh');
  mkdirSync(join(directory, 'scripts'));
  writeFileSync(script, `echo '${JSON.stringify({ imp: { freeMib: 8192, room: true } })}'\n`);
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_CAPACITY', script));
  return join(directory, 'pacing.json');
}

test('a lane pacing.json gets wrong is the sample\'s error, though capacity read, so the watcher sends no fill nudge', async () => {
  writeFileSync(setupTest(), JSON.stringify({ lanes: { imp: { 'Bad Teapot': 2 }, local: {} } }));
  const sample = await readCapacity(realRunner);
  expect([sample.cap?.imp?.freeMib, sample.lanes, sample.error]).toStrictEqual([8192, null, 'pacing.json: pacing.json lanes: bad lane imp.Bad Teapot']);
});

test.each([
  { name: 'reads impd live into the sample', impz: buildStubImpzRunner({ info: { ramBudgetMib: 20_480, ramUsedMib: 14_336, ramCommittedMib: 14_336 }, imps: [] }), impd: { budgetMib: 20_480, usedMib: 14_336, committedMib: 14_336, nonnixAwakeMib: 0, nonnixAwakeVcpus: 0, nixAwakeMib: 0, priorityKeptMib: 0 }, impdError: null },
  { name: 'carries no live reading, and why, when impz fails', impz: () => Promise.resolve({ code: 1, stdout: '', stderr: 'impz: impd is down' }), impd: null, impdError: 'impz info failed or timed out; impz ls failed or timed out' },
])('it $name', async (row) => {
  writeFileSync(setupTest(), JSON.stringify({ lanes: { imp: { cleanup: 2 }, local: {} } }));
  const run: Runner = (command, options) => (command[0] === 'impz' ? row.impz(command, options) : realRunner(command, options));

  const sample = await readCapacity(run);

  expect([sample.impd, sample.impdError]).toStrictEqual([row.impd, row.impdError]);
});

test('good lanes read with capacity carry no error', async () => {
  writeFileSync(setupTest(), JSON.stringify({ lanes: { imp: { cleanup: 2 }, local: {} } }));
  const sample = await readCapacity(realRunner);
  expect([sample.lanes, sample.error]).toStrictEqual([[{ name: 'cleanup', place: 'imp', size: 2 }], null]);
});

test("the sample carries pacing.json's local room, an unattended imp provider's localFallback", async () => {
  writeFileSync(setupTest(), JSON.stringify({ slots: { imp: 4, local: 6 }, providers: { kettle: { unattended: true, target: 'imp', localFallback: 2 } } }));
  const sample = await readCapacity(realRunner);
  expect(sample.localRoom).toBe(2);
});

test('it reads a capacity.sh reading that still carries a design key', async () => {
  const pacing = setupTest();
  writeFileSync(join(dirname(pacing), 'scripts', 'capacity.sh'), `echo '${JSON.stringify({ imp: { freeMib: 4096, room: true }, design: { room: false } })}'\n`);

  const sample = await readCapacity(realRunner);

  expect(sample.cap?.imp).toStrictEqual({ freeMib: 4096, room: true });
  expect(sample.error).toBeNull();
});

test("it carries pacing.json's error for the design counts in the sample, with the lanes still read", async () => {
  writeFileSync(setupTest(), JSON.stringify({ lanes: { imp: { cleanup: 2 }, local: {} }, agentDesignSlots: 'two' }));

  const sample = await readCapacity(realRunner);

  expect(sample.designError).toBe('pacing.json: pacing.json designSlots and agentDesignSlots: give each a whole number from 0 to 100');
  expect(sample.lanes).toStrictEqual([{ name: 'cleanup', place: 'imp', size: 2 }]);
});
