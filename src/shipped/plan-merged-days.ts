import { match } from 'ts-pattern';
import { TZ } from '../clock/tz.ts';
import type { ShippedPeriod } from './types.ts';

export interface MergedDaysPlan {
  today: string;
  days: string[];
}

// The Sydney calendar days a period's merged PRs are read for, as YYYY-MM-DD: today, the day
// before, or the days of the week (Monday to Sunday) that holds today, up to today.
export function planMergedDays(period: ShippedPeriod, at: Date): MergedDaysPlan {
  const today = SYDNEY_DATE.format(at);
  return match(period)
    .with('today', () => ({ today, days: [today] }))
    .with('yesterday', () => ({ today, days: [buildShiftedDay(today, -1)] }))
    .with('week', () => ({ today, days: buildWeekDays(today) }))
    .exhaustive();
}

const SYDNEY_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// The week's days from Monday up to `today`.
function buildWeekDays(today: string): string[] {
  const SINCE_MONDAY = 6,
    WEEK = 7,
    monday = buildShiftedDay(today, -((toUTCDate(today).getUTCDay() + SINCE_MONDAY) % WEEK));
  return Array.from({ length: WEEK }, (_unused, offset) => buildShiftedDay(monday, offset)).filter((day) => day <= today);
}

// The calendar day `by` days from a YYYY-MM-DD date, counted in whole days, so a daylight saving
// change cannot skip or repeat one.
function buildShiftedDay(day: string, by: number): string {
  const date = toUTCDate(day);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

function toUTCDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
}
