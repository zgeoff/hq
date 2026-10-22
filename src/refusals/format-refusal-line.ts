import { TZ } from '../morning/tz.ts';
import { formatWho as who } from './format-who.ts';
import type { RefusalRow } from './types.ts';

export function formatRefusalLine(r: RefusalRow): string {
  return [when(r.at), who(r), r.tool ?? '?', r.input ?? '-', r.reason ? `(${r.reason})` : '(no reason)'].join('  ');
}

const when = (t: string) => new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hourCycle: 'h23', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).replace(',', '');
