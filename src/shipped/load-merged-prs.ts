import { iso } from '../clock/iso.ts';
import { findCacheEntries } from './find-cache-entries.ts';
import { findValidBody } from './find-valid-body.ts';
import { mergeMergedDays } from './merge-merged-days.ts';
import { mergedPRsOutputSchema } from './merged-prs-output-schema.ts';
import { parseMergedPRs } from './parse-merged-prs.ts';
import { planMergedDays } from './plan-merged-days.ts';
import type { MergedDaysPlan } from './plan-merged-days.ts';
import { runDeliveryScript } from './run-delivery-script.ts';
import type { ShippedPeriod, ShippedSources } from './types.ts';
import { upsertCacheEntries } from './upsert-cache-entries.ts';

// The merged PRs of a period, as merged-prs.sh prints them, read one Sydney day at a time. A day
// before today is kept for good, and read again only when what is kept does not fit the schema; today
// is read on every call. A week gives the days merged into what `weekly` prints.
export async function loadMergedPRs(sources: ShippedSources, period: ShippedPeriod, at: Date): Promise<string> {
  const bodies = await readDays(sources, planMergedDays(period, at), at),
    [only] = bodies;
  if (period !== 'week' && only !== undefined) {
    return only;
  }
  return JSON.stringify(mergeMergedDays(bodies.map((body) => parseMergedPRs(body))));
}

async function readDays(sources: ShippedSources, calendar: MergedDaysPlan, at: Date): Promise<string[]> {
  const bodies: string[] = [],
    kept = await findCacheEntries(
      sources.db,
      'merged-day',
      calendar.days.filter((day) => day < calendar.today),
      at,
    );
  for (const day of calendar.days) {
    const hit = kept.get(day);
    if (hit !== undefined && findValidBody(hit, mergedPRsOutputSchema) !== undefined) {
      bodies.push(hit);
    } else {
      const body = await readDay(sources, day, day < calendar.today, at);
      bodies.push(body);
    }
  }
  return bodies;
}

async function readDay(sources: ShippedSources, day: string, isPast: boolean, at: Date): Promise<string> {
  const body = await runDeliveryScript(sources, 'merged-prs.sh', ['daily', day]);
  parseMergedPRs(body);
  if (isPast) {
    await upsertCacheEntries(sources.db, [{ kind: 'merged-day', key: day, body, fetched_at: iso(at), expires_at: null }]);
  }
  return body;
}
