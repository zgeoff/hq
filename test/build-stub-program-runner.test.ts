import { expect, test } from 'bun:test';
import { buildStubProgramRunner } from './build-stub-program-runner.ts';

test('it answers a command with the answer for its program, whatever its arguments', () => {
  const run = buildStubProgramRunner({ op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' }, bash: { code: 0, stdout: '{"kettles":2}', stderr: '' } });

  expect(run(['op', 'read', 'op://kettle/teapot-key/credential'])).resolves.toStrictEqual({ code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' });
});

test('it fails a program it has no answer for, as a shell does for a missing program', () => {
  const run = buildStubProgramRunner({ op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } });

  expect(run(['gh', 'api', 'repos/kettle-co/kettle/releases'])).resolves.toStrictEqual({ code: 127, stdout: '', stderr: 'gh: command not found' });
});

test('it fails an empty command', () => {
  const run = buildStubProgramRunner({ op: { code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' } });

  expect(run([])).resolves.toStrictEqual({ code: 127, stdout: '', stderr: ': command not found' });
});
