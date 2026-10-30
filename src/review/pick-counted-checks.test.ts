import { expect, test } from 'bun:test';
import { pickCountedChecks } from './pick-counted-checks.ts';

test('it keeps a cancelled run when only an earlier run of the workflow passed', () => {
  const checks = [
    { workflow: 'PR', name: 'job-1', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', startedAt: '2026-10-14T00:50:00Z', cancelled: false, passing: true },
    { workflow: 'PR', name: 'job-2', url: 'https://github.com/acme/kettle/actions/runs/701/job/2', startedAt: '2026-10-14T01:00:00Z', cancelled: true, passing: false },
  ];
  expect(pickCountedChecks(checks, (check) => check)).toStrictEqual(checks);
});

test('it keeps a cancelled run when only a later run of another workflow passed', () => {
  const checks = [
    { workflow: 'PR', name: 'job-3', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', startedAt: '2026-10-14T01:00:00Z', cancelled: true, passing: false },
    { workflow: 'Docs', name: 'job-4', url: 'https://github.com/acme/kettle/actions/runs/701/job/2', startedAt: '2026-10-14T01:00:05Z', cancelled: false, passing: true },
  ];
  expect(pickCountedChecks(checks, (check) => check)).toStrictEqual(checks);
});

test('it keeps a cancelled check that names no Actions run', () => {
  const checks = [
    { workflow: 'PR', name: 'job-5', url: null, startedAt: '2026-10-14T01:00:00Z', cancelled: true, passing: false },
    { workflow: 'PR', name: 'job-6', url: 'https://github.com/acme/kettle/actions/runs/701/job/2', startedAt: '2026-10-14T01:00:05Z', cancelled: false, passing: true },
  ];
  expect(pickCountedChecks(checks, (check) => check)).toStrictEqual(checks);
});

test('it drops only the cancelled check of a run that a later run replaced, and keeps its failed check', () => {
  const failed = { workflow: 'PR', name: 'job-9', url: 'https://github.com/acme/kettle/actions/runs/700/job/2', startedAt: '2026-10-14T01:00:02Z', cancelled: false, passing: false };
  const later = { workflow: 'PR', name: 'job-7', url: 'https://github.com/acme/kettle/actions/runs/701/job/3', startedAt: '2026-10-14T01:00:05Z', cancelled: false, passing: true };
  expect(
    pickCountedChecks([{ workflow: 'PR', name: 'job-8', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', startedAt: '2026-10-14T01:00:00Z', cancelled: true, passing: false }, failed, later], (check) => check),
  ).toStrictEqual([failed, later]);
});

test('it judges a later run by the newest attempt of each check, so a failed then passed re-run replaces the cancelled run', () => {
  const passedRerun = { workflow: 'PR', name: 'lint', url: 'https://github.com/acme/kettle/actions/runs/701/job/4', startedAt: '2026-10-14T01:10:00Z', cancelled: false, passing: true };
  const failedAttempt = { workflow: 'PR', name: 'lint', url: 'https://github.com/acme/kettle/actions/runs/701/job/3', startedAt: '2026-10-14T01:00:05Z', cancelled: false, passing: false };
  expect(
    pickCountedChecks([{ workflow: 'PR', name: 'test-matrix', url: 'https://github.com/acme/kettle/actions/runs/700/job/1', startedAt: '2026-10-14T01:00:00Z', cancelled: true, passing: false }, failedAttempt, passedRerun], (check) => check),
  ).toStrictEqual([failedAttempt, passedRerun]);
});

test('it keeps a cancelled re-run that starts after the later run passed', () => {
  const rerun = { workflow: 'PR', name: 'job-8', url: 'https://github.com/acme/kettle/actions/runs/700/job/5', startedAt: '2026-10-14T01:10:00Z', cancelled: true, passing: false };
  const later = { workflow: 'PR', name: 'job-7', url: 'https://github.com/acme/kettle/actions/runs/701/job/3', startedAt: '2026-10-14T01:00:05Z', cancelled: false, passing: true };
  expect(pickCountedChecks([rerun, later], (check) => check)).toStrictEqual([rerun, later]);
});
