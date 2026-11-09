import { expect, test } from 'bun:test';
import { buildMockCIRun } from './build-mock-ci-run.ts';

test('it builds a default completed CI run', () => {
  expect(buildMockCIRun()).toStrictEqual({
    id: 1,
    repo: 'atc',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    attempt: 1,
    created_at: '2026-10-16T02:00:00Z',
    started_at: '2026-10-16T02:00:00Z',
    updated_at: '2026-10-16T02:10:00Z',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockCIRun({ id: 7, conclusion: null, started_at: null })).toMatchObject({ id: 7, conclusion: null, started_at: null, repo: 'atc' });
});
