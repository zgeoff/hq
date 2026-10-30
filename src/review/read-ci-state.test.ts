import { expect, test } from 'bun:test';
import type { Runner } from '../runner/types.ts';
import { readCIState } from './read-ci-state.ts';

function setupTest(checks: unknown[]): { run: Runner } {
  return {
    run: (cmd) => {
      const stdout = cmd.join(' ').includes('--json name,state,bucket,workflow,link') ? JSON.stringify(checks) : '0\n';
      return Promise.resolve({ code: 0, stdout, stderr: '' });
    },
  };
}

test('it leaves out a cancelled run when a later run of the same workflow passed', async () => {
  const run = setupTest([
    { name: 'pr / test-matrix', state: 'CANCELLED', bucket: 'cancel', workflow: 'PR', link: 'https://github.com/acme/kettle/actions/runs/800/job/1' },
    { name: 'pr / test', state: 'SUCCESS', bucket: 'pass', workflow: 'PR', link: 'https://github.com/acme/kettle/actions/runs/801/job/2' },
  ]).run;
  const state = await readCIState(run, 'acme/kettle', 9, false);
  expect(state).toStrictEqual({ checks: [{ name: 'pr / test', state: 'SUCCESS', bucket: 'pass' }], checksError: null, openThreads: 0 });
});
