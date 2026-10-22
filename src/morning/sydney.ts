import { TZ } from './tz.ts';

// The Sydney wall clock at an instant.
export function sydney(at: Date): { y: number; mo: number; d: number; h: number; mi: number; date: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const [y, mo, d] = [g('year'), g('month'), g('day')];
  return { y, mo, d, h: g('hour'), mi: g('minute'), date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}
