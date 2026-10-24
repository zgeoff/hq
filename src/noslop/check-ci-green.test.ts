import { expect, test } from 'bun:test';
import { checkCIGreen } from './check-ci-green.ts';

test("it leaves noslop's App check, which names no workflow, to the gate's noslop route", () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'noslop', workflowName: '', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:06:00Z' },
      { __typename: 'CheckRun', name: 'noslop', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:07:00Z' },
    ]),
  ).toStrictEqual({ green: true });
});

test('it counts a GitHub Actions job named noslop like any other check', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'noslop', workflowName: 'lint', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:06:00Z' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: noslop (FAILURE)' });
});

test('it counts a status named noslop like any other check', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'StatusContext', context: 'noslop', state: 'FAILURE', startedAt: '2026-10-14T01:06:00Z' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: noslop (FAILURE)' });
});

test('it passes a check whose failed run was re-run and passed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
    ]),
  ).toStrictEqual({ green: true });
});

test('it blocks a check whose passed run was re-run and failed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (FAILURE)' });
});

test('it judges by completion time, not by order in the rollup', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (FAILURE)' });
});

test('it blocks a passed check whose re-run is still running', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'kettle', status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-10-14T01:10:00Z', completedAt: '0001-01-01T00:00:00Z' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (IN_PROGRESS)' });
});

test('it blocks when two runs of one check tie in time and one failed', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', name: 'kettle', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: kettle (FAILURE)' });
});

test('it keeps a failed check of the same name in another workflow', () => {
  expect(
    checkCIGreen([
      { __typename: 'CheckRun', name: 'test', workflowName: 'kettle', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:05:00Z' },
      { __typename: 'CheckRun', name: 'test', workflowName: 'teapot', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-14T01:10:00Z', completedAt: '2026-10-14T01:15:00Z' },
    ]),
  ).toStrictEqual({ green: false, reason: 'CI is not green: test (FAILURE)' });
});
