import { TZ } from '../clock/tz.ts';

export function formatClock(at: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(at));
}
