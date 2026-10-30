import { expect, test } from 'bun:test';
import { pickCountedChecks } from './pick-counted-checks.ts';
import type { RunFacts } from './pick-counted-checks.ts';

function setupTest(): { describe: (check: RunFacts) => RunFacts } {
  return { describe: (check) => check };
}

test('it keeps a cancelled run when only an earlier run of the workflow passed', () => {
  const describe = setupTest().describe;
  const checks = [
    { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', cancelled: false, passing: true },
    { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/701/job/2', cancelled: true, passing: false },
  ];
  expect(pickCountedChecks(checks, describe)).toStrictEqual(checks);
});

test('it keeps a cancelled run when only a later run of another workflow passed', () => {
  const describe = setupTest().describe;
  const checks = [
    { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', cancelled: true, passing: false },
    { workflow: 'Docs', url: 'https://github.com/acme/kettle/actions/runs/701/job/2', cancelled: false, passing: true },
  ];
  expect(pickCountedChecks(checks, describe)).toStrictEqual(checks);
});

test('it keeps a cancelled check that names no Actions run', () => {
  const describe = setupTest().describe;
  const checks = [
    { workflow: 'PR', url: null, cancelled: true, passing: false },
    { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/701/job/2', cancelled: false, passing: true },
  ];
  expect(pickCountedChecks(checks, describe)).toStrictEqual(checks);
});

test('it drops every check of a cancelled run, its failed summary job included, once a later run passed', () => {
  const describe = setupTest().describe;
  const later = { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/701/job/3', cancelled: false, passing: true };
  expect(
    pickCountedChecks([
      { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', cancelled: true, passing: false },
      { workflow: 'PR', url: 'https://github.com/acme/kettle/actions/runs/700/job/2', cancelled: false, passing: false },
      later,
    ], describe),
  ).toStrictEqual([later]);
});
