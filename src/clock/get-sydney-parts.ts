import { TZ } from './tz.ts';

interface SydneyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function getSydneyParts(d: Date): SydneyParts {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}
