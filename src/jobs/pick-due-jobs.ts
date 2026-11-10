import { iso } from '../clock/iso.ts';
import { buildNextSlot } from './build-next-slot.ts';
import { parseSchedule } from './parse-schedule.ts';
import type { DueJobs, SessionJob } from './types.ts';

// A job that missed several slots comes back once, for its oldest missed slot, with its next slot
// after `at`: downtime never turns into a burst. A due job whose stored schedule no longer parses
// comes back as broken, so it can't stop the others.
export function pickDueJobs(jobs: readonly SessionJob[], at: Date): DueJobs {
  const picked: DueJobs = { due: [], broken: [] };
  for (const job of jobs) {
    if (job.removed_at !== null || Date.parse(job.next_at) > at.getTime()) {
      continue;
    }
    const parsed = parseSchedule(job.kind, job.spec);
    if (!parsed.ok) {
      picked.broken.push({ job, reason: parsed.reason });
      continue;
    }
    const next = buildNextSlot(parsed.schedule, new Date(job.added_at), at);
    picked.due.push({ job, slot: job.next_at, nextAt: next === null ? null : iso(next) });
  }
  return picked;
}
