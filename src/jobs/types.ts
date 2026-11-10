import type { z } from 'zod';
import type { buildRowSchema } from '../db/build-row-schema.ts';

export type SessionJob = z.output<ReturnType<typeof buildRowSchema<'session_jobs'>>>;

export type ScheduleKind = SessionJob['kind'];

export type Schedule = { kind: 'every'; everyMs: number } | { kind: 'daily'; minuteOfDay: number } | { kind: 'at'; atMs: number };

export interface ScheduleValue {
  kind: ScheduleKind;
  spec: string;
}

export type ScheduleParse = { ok: true; value: ScheduleValue; schedule: Schedule } | { ok: false; reason: string };

export interface DueJob {
  job: SessionJob;
  slot: string;
  nextAt: string | null;
}

export interface BrokenJob {
  job: SessionJob;
  reason: string;
}

export interface DueJobs {
  due: DueJob[];
  broken: BrokenJob[];
}
