import { expect, test } from 'bun:test';
import { makePRStateGh } from './make-pr-state-gh.ts';

test('the stand-in answers a known PR state, fails an unknown PR, and records each call', async () => {
  const calls: string[] = [],
    gh = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' }, calls }),
    known = await gh(['gh', 'pr', 'view', '4', '-R', 'kettle-co/kettle', '--json', 'state']),
    other = await gh(['gh', 'api', 'user']),
    unknown = await gh(['gh', 'pr', 'view', '5', '-R', 'kettle-co/kettle', '--json', 'state']);

  expect(known).toStrictEqual({ code: 0, stdout: '{"state":"MERGED"}', stderr: '' });
  expect(unknown).toStrictEqual({ code: 1, stdout: '', stderr: 'invented: no such PR' });
  expect(other.code).toBe(1);
  expect(calls).toStrictEqual(['gh pr view 4 -R kettle-co/kettle --json state', 'gh api user', 'gh pr view 5 -R kettle-co/kettle --json state']);
});

test('the stand-in hands any other command to its fallback', async () => {
  const gh = makePRStateGh({ states: {}, fallback: () => Promise.resolve({ code: 0, stdout: 'invented capacity', stderr: '' }) }),
    r = await gh(['capacity.sh']);

  expect(r.stdout).toBe('invented capacity');
});
