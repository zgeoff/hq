import { expect, test } from 'bun:test';
import { buildStubGateFacts } from '../../test/build-stub-gate-facts.ts';
import { buildStubProgramRunner } from '../../test/build-stub-program-runner.ts';
import { checkCIGreen } from './check-ci-green.ts';
import { readGateFacts } from './read-gate-facts.ts';

test("it keeps each check's run URL, so the gate passes a cancelled run that a later run replaced", async () => {
  const run = buildStubProgramRunner({
    gh: buildStubGateFacts({
      head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      checks: [
        { __typename: 'CheckRun', name: 'pr / test-matrix', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/1', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
        { __typename: 'CheckRun', name: 'pr / test', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/501/job/2', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:05Z', completedAt: '2026-10-14T01:04:00Z' },
      ],
    }),
  });

  const facts = await readGateFacts(run, 'acme/kettle', 9);

  expect(facts.statusCheckRollup.map((check) => ('detailsUrl' in check ? check.detailsUrl : null))).toStrictEqual(['https://github.com/acme/kettle/actions/runs/500/job/1', 'https://github.com/acme/kettle/actions/runs/501/job/2']);
  expect(checkCIGreen(facts.statusCheckRollup, [])).toStrictEqual({ green: true });
});
