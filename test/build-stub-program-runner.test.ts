import { expect, test } from 'bun:test';
import { buildStubProgramRunner } from './build-stub-program-runner.ts';

test('it answers a command with the answer for its program, whatever its arguments', async () => {
  const run = buildStubProgramRunner({ op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' }, bash: { code: 0, stdout: '{"kettles":2}', stderr: '' } });

  expect(await run(['op', 'read', 'op://kettle/teapot-key/credential'])).toStrictEqual({ code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' });
});

test('it fails a program it has no answer for, as a shell does for a missing program', async () => {
  const run = buildStubProgramRunner({ op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } });

  expect(await run(['gh', 'api', 'repos/kettle-co/kettle/releases'])).toStrictEqual({ code: 127, stdout: '', stderr: 'gh: command not found' });
});

test('it fails an empty command', async () => {
  const run = buildStubProgramRunner({ op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } });

  expect(await run([])).toStrictEqual({ code: 127, stdout: '', stderr: ': command not found' });
});
