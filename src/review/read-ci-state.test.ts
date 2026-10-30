import { expect, test } from 'bun:test';
import { buildRecordingRunner } from '../../test/build-recording-runner.ts';
import { buildStubProgramRunner } from '../../test/build-stub-program-runner.ts';
import { readCIState } from './read-ci-state.ts';

test('it leaves out a cancelled run when a later run of the same workflow passed', async () => {
  const checks = [
    { name: 'pr / test-matrix', state: 'CANCELLED', bucket: 'cancel', workflow: 'PR', link: 'https://github.com/acme/kettle/actions/runs/800/job/1', startedAt: '2026-10-14T01:00:00Z' },
    { name: 'pr / test', state: 'SUCCESS', bucket: 'pass', workflow: 'PR', link: 'https://github.com/acme/kettle/actions/runs/801/job/2', startedAt: '2026-10-14T01:00:05Z' },
  ];
  const run = buildStubProgramRunner({ gh: { code: 0, stdout: JSON.stringify(checks), stderr: '' } });

  const state = await readCIState(run, 'acme/kettle', 9, false);

  expect(state.checks).toStrictEqual([{ name: 'pr / test', state: 'SUCCESS', bucket: 'pass' }]);
});

test("it asks gh for each check's workflow, run link and start time", async () => {
  const recorder = buildRecordingRunner(buildStubProgramRunner({ gh: { code: 0, stdout: '[]', stderr: '' } }));

  await readCIState(recorder.run, 'acme/kettle', 9, false);

  expect(recorder.commands[0]).toStrictEqual(['gh', 'pr', 'checks', '9', '-R', 'acme/kettle', '--json', 'name,state,bucket,workflow,link,startedAt']);
});
