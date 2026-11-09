import { expect, test } from 'bun:test';
import { buildMockJobRun } from './build-mock-job-run.ts';

test('it builds a default queued morning run keyed to a target', () => {
  expect(buildMockJobRun()).toStrictEqual({ job: 'morning-reports', key: '2026-10-17', at: '2026-10-16T22:16:00Z', result: 'queued', detail: null, outbox_key: 'hq-ev1-z-stu' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockJobRun({ key: '2026-10-18', outbox_key: 'hq-ev4-z-stu' })).toMatchObject({ key: '2026-10-18', outbox_key: 'hq-ev4-z-stu', result: 'queued' });
});
