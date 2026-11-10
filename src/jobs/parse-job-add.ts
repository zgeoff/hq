import { buildNextSlot } from './build-next-slot.ts';
import { parseScheduleFlags } from './parse-schedule.ts';
import type { ScheduleFlags } from './parse-schedule.ts';
import type { NewJob } from './types.ts';

export type JobAddFlags = ScheduleFlags & { prompt?: string | undefined };

export interface JobAddInput {
  target: string | undefined;
  flags: JobAddFlags;
  declared: readonly string[];
  at: Date;
}

export type JobAddParse = { ok: true; job: Omit<NewJob, 'actor'> } | { ok: false; reason: string };

export function parseJobAdd(input: JobAddInput): JobAddParse {
  const target = input.target;
  if (target === undefined || target.trim() === '') {
    return { ok: false, reason: 'hq jobs add needs a role, like z-release' };
  }
  if (!input.declared.includes(target)) {
    return { ok: false, reason: `${target} is no declared fleet session` };
  }
  const prompt = input.flags.prompt;
  if (prompt === undefined || prompt.trim() === '') {
    return { ok: false, reason: '--prompt is required' };
  }
  const parsed = parseScheduleFlags(input.flags);
  if (!parsed.ok) {
    return parsed;
  }
  const nextAt = buildNextSlot(parsed.schedule, input.at, input.at);
  if (nextAt === null) {
    return { ok: false, reason: `--at ${parsed.value.spec} is already past` };
  }
  return { ok: true, job: { target, value: parsed.value, prompt, nextAt } };
}
