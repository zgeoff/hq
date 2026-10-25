import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../../db/meta-json.ts';
import { setMeta } from '../../db/set-meta.ts';
import { addNews } from '../../news/add-news.ts';
import { formatResetTime } from '../format-reset-time.ts';
import type { FleetView } from './types.ts';

const FINGERPRINT_KEY = 'fleet_forecast_fingerprint';
const MOVE_MS = 30 * 60_000;
const FINGERPRINT = z.object({ pauseStart: z.string(), cap: z.number().nullable() }).nullable();

export function writeFleetNews(db: Database, view: FleetView): boolean {
  if (view.forecast === null) {
    return false;
  }
  const pause = view.forecast.pause;
  if (pause === null) {
    setMeta(db, FINGERPRINT_KEY, null);
    return false;
  }
  const cap = view.forecast.safeCap?.lanes ?? null;
  const last = metaJson(db, FINGERPRINT_KEY, FINGERPRINT, null);
  if (last !== null && last.cap === cap && Math.abs(Date.parse(pause.start) - Date.parse(last.pauseStart)) < MOVE_MS) {
    return false;
  }
  const advice = cap === null ? 'no lane cap avoids it' : `a cap of ${cap} lanes avoids it`;
  addNews(db, { from: 'hq-capacity', topic: 'report', text: `Fleet forecast: every Claude slot is at ${view.limit}% from ${formatResetTime(pause.start)} for ${pause.hours.toFixed(1)} h at the current rate; ${advice}`, issue: null, link: null, needsGeoff: false });
  setMeta(db, FINGERPRINT_KEY, JSON.stringify({ pauseStart: pause.start, cap }));
  return true;
}
