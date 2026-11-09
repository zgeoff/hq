import { TZ } from '../../clock/tz.ts';

export function formatCapUntil(until: string, options: { withDate: boolean } = { withDate: false }): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(until));
  const part = (type: string): string => parts.find((candidate) => candidate.type === type)?.value ?? '';
  const date = options.withDate ? ` ${part('day')} ${part('month')}` : '';
  return `${part('weekday')}${date} ${part('hour')}:${part('minute')}`;
}
