import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import { TZ } from '../morning/tz.ts';

// The weekly audit's 1Password lines, one per Sydney day from `from`: the account's highest reading
// in the capacity samples, hq's own reads by consumer from the op read events, and the rest as
// "other". 1Password's day resets on its own clock, not Sydney's, so "other" is approximate.
export function loadOpWeek(db: Database, from: Date): string {
  const day0 = sydney(from),
    lines = Array.from({ length: 7 }, (_, i) => loadOpDay(db, sydneyUtc(day0.y, day0.mo, day0.d + i), sydneyUtc(day0.y, day0.mo, day0.d + i + 1)));
  return ["1Password requests by Sydney day: the account's highest reading, hq's own reads, and the rest (approximate: 1Password's day resets on its own clock).", ...lines].join('\n');
}

interface DayPeak {
  used: number | null;
  limit: number | null;
}

interface ConsumerReads {
  consumer: string;
  requests: number;
}

function loadOpDay(db: Database, dayStart: Date, dayEnd: Date): string {
  const byConsumer = db
      .query("SELECT json_extract(data, '$.consumer') AS consumer, SUM(json_extract(data, '$.requests')) AS requests FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read' AND at >= ? AND at < ? GROUP BY consumer ORDER BY consumer")
      .all(iso(dayStart), iso(dayEnd)) as ConsumerReads[],
    day = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(dayStart),
    hqTotal = byConsumer.reduce((sum, read) => sum + read.requests, 0),
    parts = byConsumer.map((read) => `${CONSUMER_NAMES[read.consumer] ?? read.consumer} ${formatCount(read.requests)}`),
    peak = db.query('SELECT MAX(op_account_used) AS used, MAX(op_account_limit) AS "limit" FROM capacity_samples WHERE at >= ? AND at < ?').get(iso(dayStart), iso(dayEnd)) as DayPeak;
  if (peak.used === null || peak.limit === null) {
    return `- ${day}: no reading. ${parts.join(', ') || 'no hq reads'}`;
  }
  return `- ${day}: ${formatCount(peak.used)} of ${formatCount(peak.limit)}. ${[...parts, `other ${formatCount(Math.max(0, peak.used - hqTotal))}`].join(', ')}`;
}

const CONSUMER_NAMES: Record<string, string> = { linear: 'Linear', noslop: 'noslop' };

function formatCount(n: number): string {
  return n.toLocaleString('en-AU');
}
