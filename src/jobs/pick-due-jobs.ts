import invariant from 'tiny-invariant';
import { iso } from '../clock/iso.ts';
import { buildNextSlot } from './build-next-slot.ts';
import { parseSchedule } from './parse-schedule.ts';
import type { DueJob, SessionJob } from './types.ts';

// A job that missed several slots comes back once, for its oldest missed slot, with its next slot
// after `at`: downtime never turns into a burst.
export function pickDueJobs(jobs: readonly SessionJob[], at: Date): DueJob[] {
  return jobs
    .filter((job) => job.removed_at === null && Date.parse(job.next_at) <= at.getTime())
    .map((job) => {
      const parsed = parseSchedule(job.kind, job.spec);
      invariant(parsed.ok, 'a stored job schedule was valid when it was added');
      const next = buildNextSlot(parsed.schedule, new Date(job.added_at), at);
      return { job, slot: job.next_at, nextAt: next === null ? null : iso(next) };
    });
}
