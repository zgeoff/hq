import { TZ } from '../../clock/tz.ts';

// A Sydney wall time as `Mon 08:00`.
export function formatCapUntil(until: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(until));
  const part = (type: string): string => parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('weekday')} ${part('hour')}:${part('minute')}`;
}
