import { iso } from '../../clock/iso.ts';
import { HqError } from '../../errors.ts';
import { sydney } from '../../morning/sydney.ts';
import { ISO_TIME } from '../iso-time.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SYDNEY_TIME = /^(?<weekday>Sun|Mon|Tue|Wed|Thu|Fri|Sat) (?<hour>\d{2}):(?<minute>\d{2})$/iu;

export function parseCapUntil(text: string, at: Date): string {
  const wall = SYDNEY_TIME.exec(text);
  if (wall !== null) {
    const weekday = WEEKDAYS.findIndex((name) => name.toLowerCase() === (wall.groups?.['weekday'] ?? '').toLowerCase());
    const found = findNextSydneyMoment({ weekday, hour: Number(wall.groups?.['hour']), minute: Number(wall.groups?.['minute']) }, at);
    if (found === null) {
      throw new HqError('bad_args', `--until "${text}" is not a time of day: use Ddd HH:MM, such as Mon 08:00`);
    }
    return iso(found);
  }
  const time = Date.parse(text);
  if (!ISO_TIME.test(text) || Number.isNaN(time)) {
    throw new HqError('bad_args', `--until takes an ISO time, such as 2026-11-02T09:00:00Z, or a Sydney time such as Mon 08:00, not "${text.slice(0, 60)}"`);
  }
  if (time <= at.getTime()) {
    throw new HqError('bad_args', `--until ${text} has passed; give a later time`);
  }
  return iso(new Date(time));
}

interface WallTime {
  weekday: number;
  hour: number;
  minute: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Sydney sits 10 or 11 hours ahead of UTC, so a wall time is one of two instants, and a repeated or
// skipped hour at a DST edge leaves two matches or none.
function findNextSydneyMoment(wall: WallTime, at: Date): Date | null {
  if (wall.hour > 23 || wall.minute > 59) {
    return null;
  }
  const today = sydney(at);
  for (let offset = 0; offset <= 14; offset += 1) {
    const day = new Date(Date.UTC(today.y, today.mo - 1, today.d) + offset * DAY_MS);
    if (day.getUTCDay() !== wall.weekday) {
      continue;
    }
    const naive = day.getTime() + wall.hour * HOUR_MS + wall.minute * 60_000;
    const matches = [naive - 11 * HOUR_MS, naive - 10 * HOUR_MS].map((candidateMs) => new Date(candidateMs)).filter((candidate) => isSydneyWall(candidate, day, wall) && candidate.getTime() > at.getTime());
    if (matches.length > 0) {
      return matches[0] ?? null;
    }
  }
  return null;
}

function isSydneyWall(candidate: Date, day: Date, wall: WallTime): boolean {
  const seen = sydney(candidate);
  return seen.y === day.getUTCFullYear() && seen.mo === day.getUTCMonth() + 1 && seen.d === day.getUTCDate() && seen.h === wall.hour && seen.mi === wall.minute;
}
