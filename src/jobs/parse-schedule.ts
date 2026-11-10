import { match } from 'ts-pattern';
import type { ScheduleKind, ScheduleParse } from './types.ts';

export interface ScheduleFlags {
  every?: string | undefined;
  daily?: string | undefined;
  at?: string | undefined;
}

export function parseScheduleFlags(flags: ScheduleFlags): ScheduleParse {
  const given: { kind: ScheduleKind; spec: string }[] = [];
  if (flags.every !== undefined) {
    given.push({ kind: 'every', spec: flags.every });
  }
  if (flags.daily !== undefined) {
    given.push({ kind: 'daily', spec: flags.daily });
  }
  if (flags.at !== undefined) {
    given.push({ kind: 'at', spec: flags.at });
  }
  const [only, ...extra] = given;
  if (only === undefined || extra.length > 0) {
    return { ok: false, reason: 'give exactly one of --every <30m|2h|1d>, --daily <HH:MMZ> or --at <ISO time>' };
  }
  return parseSchedule(only.kind, only.spec);
}

export function parseSchedule(kind: ScheduleKind, spec: string): ScheduleParse {
  if (kind === 'every') {
    return parseEvery(spec);
  }
  if (kind === 'daily') {
    return parseDaily(spec);
  }
  return parseAt(spec);
}

const MINUTE_MS = 60_000;

// The watcher ticks every 5 minutes, so a shorter period could never fire on its own slots.
const MIN_EVERY_MS = 5 * MINUTE_MS;

function parseEvery(spec: string): ScheduleParse {
  const matched = /^(?<count>\d+)(?<unit>[mhd])$/u.exec(spec);
  const count = matched?.groups?.['count'];
  const unit = matched?.groups?.['unit'];
  if (count === undefined || (unit !== 'm' && unit !== 'h' && unit !== 'd')) {
    return { ok: false, reason: `--every ${spec} is not a duration like 30m, 2h or 1d` };
  }
  const everyMs = Number(count) * buildUnitMs(unit);
  if (everyMs < MIN_EVERY_MS) {
    return { ok: false, reason: `--every ${spec} is under 5m, the watcher's tick` };
  }
  return { ok: true, value: { kind: 'every', spec }, schedule: { kind: 'every', everyMs } };
}

function buildUnitMs(unit: 'm' | 'h' | 'd'): number {
  return match(unit)
    .with('m', () => MINUTE_MS)
    .with('h', () => 60 * MINUTE_MS)
    .with('d', () => 24 * 60 * MINUTE_MS)
    .exhaustive();
}

function parseDaily(spec: string): ScheduleParse {
  const matched = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)Z$/u.exec(spec);
  const hour = matched?.groups?.['hour'];
  const minute = matched?.groups?.['minute'];
  if (hour === undefined || minute === undefined) {
    return { ok: false, reason: `--daily ${spec} is not a UTC time like 09:30Z` };
  }
  return { ok: true, value: { kind: 'daily', spec }, schedule: { kind: 'daily', minuteOfDay: Number(hour) * 60 + Number(minute) } };
}

function parseAt(spec: string): ScheduleParse {
  const atMs = Date.parse(spec);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(spec) || Number.isNaN(atMs)) {
    return { ok: false, reason: `--at ${spec} is not an ISO time with a zone, like 2026-11-12T09:00:00Z` };
  }
  return { ok: true, value: { kind: 'at', spec: new Date(atMs).toISOString().replace(/\.\d{3}Z$/u, 'Z') }, schedule: { kind: 'at', atMs } };
}
