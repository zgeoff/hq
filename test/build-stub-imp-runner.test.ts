import { expect, test } from 'bun:test';
import { buildStubImpRunner } from './build-stub-imp-runner.ts';

test('imp ls lists the given imps as imp list JSON, and each command is recorded', async () => {
  const imps = buildStubImpRunner({ imps: ['home-0000a001aaaa4aaa8aaa'] });

  const listed = await imps.run(['imp', 'ls', '--json']);

  expect(listed).toStrictEqual({ code: 0, stdout: '[{"name":"home-0000a001aaaa4aaa8aaa"}]', stderr: '' });
  expect(imps.commands).toStrictEqual([['imp', 'ls', '--json']]);
});

test('imp exec answers the given result', async () => {
  const imps = buildStubImpRunner({ imps: [], exec: { code: 124, stdout: '', stderr: 'timed out\n' } });

  const executed = await imps.run(['imp', 'exec', 'home-0000a001aaaa4aaa8aaa', '--', 'sh', '-c', 'exit 0']);

  expect(executed).toStrictEqual({ code: 124, stdout: '', stderr: 'timed out\n' });
});

test('imp exec with no given result runs the command after -- on this machine', async () => {
  const imps = buildStubImpRunner({ imps: [] });

  const executed = await imps.run(['imp', 'exec', 'home-0000a001aaaa4aaa8aaa', '--', 'sh', '-c', 'printf "%s" "$1"; exit 3', 'sh', 'kettle']);

  expect(executed).toStrictEqual({ code: 3, stdout: 'kettle', stderr: '' });
});
