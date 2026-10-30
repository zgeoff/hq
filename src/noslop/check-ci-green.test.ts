import { expect, test } from 'bun:test';
import { checkCIGreen } from './check-ci-green.ts';
import type { GateCheck } from './read-gate-facts.ts';

test("it leaves noslop's App check, which names no workflow, to the gate's noslop route", () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'noslop', workflowName: '', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:06:00Z' },
      { __typename: 'CheckRun', name: 'noslop', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:07:00Z' },
    ], []),
  ).toStrictEqual({ green: true });
});

test('it counts a GitHub Actions job named noslop like any other check', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'noslop', workflowName: 'lint', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:06:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: noslop (FAILURE)' });
});

test('it counts a status named noslop like any other check', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'StatusContext', context: 'noslop', state: 'FAILURE', startedAt: '2026-10-14T01:06:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: noslop (FAILURE)' });
});

test('it passes a check whose failed run was re-run and passed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
    ], []),
  ).toStrictEqual({ green: true });
});

test('it blocks a check whose passed run was re-run and failed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (FAILURE)' });
});

test('it judges by completion time, not by order in the rollup', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (FAILURE)' });
});

test('it blocks a passed check whose re-run is still running', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-10-14T01:10:00Z', completedAt: '0001-01-01T00:00:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (IN_PROGRESS)' });
});

test('it blocks when two runs of one check tie in time and one failed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (FAILURE)' });
});

test('it keeps a failed check of the same name in another workflow', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'test', workflowName: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'test', workflowName: 'teapot', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: test (FAILURE)' });
});

test('it passes the one red check the owner named and says it was overridden', () => {
  expect(checkCIGreen([{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'])).toStrictEqual({ green: true, overridden: ['preview'] });
});

test.each(['ERROR', 'FAILURE'])('it passes a status context the owner named in state %s', (state) => {
  expect(checkCIGreen([{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'StatusContext', context: 'socket', state, startedAt: '2026-10-14T01:00:00Z' }], ['socket'])).toStrictEqual({ green: true, overridden: ['socket'] });
});

test('it says nothing of an override when every check passed', () => {
  expect(checkCIGreen([{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'])).toStrictEqual({ green: true });
});

test.each<[string, GateCheck[], string[], string]>([
  ['a second red check beside the named one', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: kettle (FAILURE)'],
  ['the named check queued', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'QUEUED', conclusion: null, startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (QUEUED)'],
  ['the named check in progress', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (IN_PROGRESS)'],
  ['the named check cancelled', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (CANCELLED)'],
  ['the named check timed out', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'TIMED_OUT', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (TIMED_OUT)'],
  ['the named check needing action', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'ACTION_REQUIRED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (ACTION_REQUIRED)'],
  ['the named check stale', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'STALE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (STALE)'],
  ['the named status context pending', [{ __typename: 'StatusContext', context: 'preview', state: 'PENDING', startedAt: '2026-10-14T01:00:00Z' }], ['preview'], 'CI is not green: preview (PENDING)'],
  ['the named check missing', [{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'previews', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: previews (FAILURE)'],
  ['a name that differs by case', [{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['Preview'], 'CI is not green: preview (FAILURE)'],
  ['a name padded with whitespace', [{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], [' preview'], 'CI is not green: preview (FAILURE)'],
  ['a name that is a prefix of the check', [{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['prev'], 'CI is not green: preview (FAILURE)'],
  ['an empty override name', [{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], [''], 'CI is not green: preview (FAILURE)'],
  ['no override', [{ __typename: 'CheckRun', name: 'kettle', workflowName: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], [], 'CI is not green: preview (FAILURE)'],
  ['two checks sharing the name in different workflows', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'nightly', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (FAILURE), preview (FAILURE)'],
  ['a check and a status context sharing the name', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'StatusContext', context: 'preview', state: 'FAILURE', startedAt: '2026-10-14T01:00:00Z' }], ['preview'], 'CI is not green: preview (FAILURE), preview (FAILURE)'],
  ['a passing check of the same name in another workflow', [{ __typename: 'CheckRun', name: 'preview', workflowName: 'deploy', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }, { __typename: 'CheckRun', name: 'preview', workflowName: 'nightly', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' }], ['preview'], 'CI is not green: preview (FAILURE)'],
])('it blocks with %s', (_label, checks, overrides, reason) => {
  expect(checkCIGreen(checks, overrides)).toStrictEqual({ green: false, reason });
});

test('it keeps the no-checks rule when an override names a check', () => {
  expect(checkCIGreen([], ['preview'])).toStrictEqual({ green: false, noChecks: true, reason: 'the head has no CI checks, so CI has not passed' });
});

test('it passes a cancelled run when a later run of the same workflow passed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'lint', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/1', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
      { __typename: 'CheckRun', name: 'pr / test-matrix', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/2', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
      { __typename: 'CheckRun', name: 'lint', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/501/job/3', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:05Z', completedAt: '2026-10-14T01:04:00Z' },
    ], []),
  ).toStrictEqual({ green: true });
});

test('it blocks a cancelled run that no later run replaced', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'lint', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/1', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
      { __typename: 'CheckRun', name: 'pr / test-matrix', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/2', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: lint (CANCELLED), pr / test-matrix (CANCELLED)' });
});

test('it blocks a cancelled run when the later run of the same workflow failed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'lint', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/1', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
      { __typename: 'CheckRun', name: 'pr / test-matrix', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/2', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
      { __typename: 'CheckRun', name: 'lint', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/501/job/3', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:05Z', completedAt: '2026-10-14T01:04:00Z' },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: lint (FAILURE), pr / test-matrix (CANCELLED)' });
});

test('it blocks a re-run of the cancelled run that is still running after the later run passed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'pr / test-matrix', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/2', status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:01Z' },
      { __typename: 'CheckRun', name: 'pr / test', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/501/job/3', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:05Z', completedAt: '2026-10-14T01:04:00Z' },
      { __typename: 'CheckRun', name: 'pr / test-matrix', workflowName: 'PR', detailsUrl: 'https://github.com/acme/kettle/actions/runs/500/job/4', status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-10-14T01:10:00Z', completedAt: null },
    ], []),
  ).toStrictEqual({ green: false, reason: 'CI is not green: pr / test-matrix (IN_PROGRESS)' });
});
