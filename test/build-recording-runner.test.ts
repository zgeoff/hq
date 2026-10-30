import { expect, test } from 'bun:test';
import { buildRecordingRunner } from './build-recording-runner.ts';
import { buildStubProgramRunner } from './build-stub-program-runner.ts';

test('it keeps each command in the order it ran', async () => {
  const recorder = buildRecordingRunner(buildStubProgramRunner({ gh: { code: 0, stdout: '[]', stderr: '' } }));

  await recorder.run(['gh', 'pr', 'checks', '7']);
  await recorder.run(['git', 'fetch']);

  expect(recorder.commands).toStrictEqual([['gh', 'pr', 'checks', '7'], ['git', 'fetch']]);
});

test("it returns the inner runner's answer", async () => {
  const recorder = buildRecordingRunner(buildStubProgramRunner({ gh: { code: 0, stdout: '[]', stderr: '' } }));

  const result = await recorder.run(['gh', 'pr', 'checks', '7']);

  expect(result).toStrictEqual({ code: 0, stdout: '[]', stderr: '' });
});
