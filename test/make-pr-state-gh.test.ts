import { expect, test } from 'bun:test';
import { makePRStateGh } from './make-pr-state-gh.ts';

test('the stand-in answers a known PR state, fails an unknown PR, and records each call', async () => {
  const calls: string[] = [];
  const gh = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' }, calls });
  const known = await gh(['gh', 'pr', 'view', '4', '-R', 'kettle-co/kettle', '--json', 'state']);
  const other = await gh(['gh', 'api', 'user']);
  const unknown = await gh(['gh', 'pr', 'view', '5', '-R', 'kettle-co/kettle', '--json', 'state']);

  expect(known).toStrictEqual({ code: 0, stdout: '{"state":"MERGED"}', stderr: '' });
  expect(unknown).toStrictEqual({ code: 1, stdout: '', stderr: 'invented: no such PR' });
  expect(other.code).toBe(1);
  expect(calls).toStrictEqual(['gh pr view 4 -R kettle-co/kettle --json state', 'gh api user', 'gh pr view 5 -R kettle-co/kettle --json state']);
});

test('the stand-in hands any other command to its fallback', async () => {
  const gh = makePRStateGh({ states: {}, fallback: () => Promise.resolve({ code: 0, stdout: 'invented capacity', stderr: '' }) });
  const result = await gh(['capacity.sh']);

  expect(result.stdout).toBe('invented capacity');
});
