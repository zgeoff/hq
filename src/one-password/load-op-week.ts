import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import { TZ } from '../morning/tz.ts';

// 1Password's day resets on its own clock, not Sydney's, so the "other" reads are approximate.
export function loadOpWeek(db: Database, from: Date): string {
  const day0 = sydney(from);
  const lines = Array.from({ length: 7 }, (_, dayOffset) => loadOpDay(db, sydneyUtc(day0.y, day0.mo, day0.d + dayOffset), sydneyUtc(day0.y, day0.mo, day0.d + dayOffset + 1)));
  return ["1Password requests by Sydney day: the account's highest reading, hq's own reads, and the rest (approximate: 1Password's day resets on its own clock).", ...lines].join('\n');
}

const ConsumerReadRows = z.array(z.object({ consumer: z.string(), requests: z.number() }));

const DayPeakRow = z.object({ used: z.number().nullable(), limit: z.number().nullable() });

function loadOpDay(db: Database, dayStart: Date, dayEnd: Date): string {
  const byConsumer = ConsumerReadRows.parse(
    db
      .query("SELECT json_extract(data, '$.consumer') AS consumer, SUM(json_extract(data, '$.requests')) AS requests FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read' AND at >= ? AND at < ? GROUP BY consumer ORDER BY consumer")
      .all(iso(dayStart), iso(dayEnd)),
  );
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(dayStart);
  const hqTotal = byConsumer.reduce((sum, read) => sum + read.requests, 0);
  const parts = byConsumer.map((read) => `${CONSUMER_NAMES[read.consumer] ?? read.consumer} ${formatCount(read.requests)}`);
  const peak = DayPeakRow.parse(db.query('SELECT MAX(op_account_used) AS used, MAX(op_account_limit) AS "limit" FROM capacity_samples WHERE at >= ? AND at < ?').get(iso(dayStart), iso(dayEnd)));
  if (peak.used === null || peak.limit === null) {
    return `- ${day}: no reading. ${parts.join(', ') || 'no hq reads'}`;
  }
  return `- ${day}: ${formatCount(peak.used)} of ${formatCount(peak.limit)}. ${[...parts, `other ${formatCount(Math.max(0, peak.used - hqTotal))}`].join(', ')}`;
}

const CONSUMER_NAMES: Record<string, string> = { linear: 'Linear', noslop: 'noslop' };

function formatCount(n: number): string {
  return n.toLocaleString('en-AU');
}
