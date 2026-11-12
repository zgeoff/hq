import { JOB } from '../job.ts';
import type { JobRun } from '../types.ts';

export function buildMockJobRun(overrides: Partial<JobRun> = {}): JobRun {
  return { job: JOB, key: '2026-10-17', at: '2026-10-16T22:16:00Z', result: 'queued', detail: null, outbox_key: 'hq-ev1-stu', ...overrides };
}
