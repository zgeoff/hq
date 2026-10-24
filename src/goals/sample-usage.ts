import type { Database } from 'bun:sqlite';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { z } from 'zod';
import { ACCOUNT_KEY } from './account-key.ts';
import { getUsageCache } from './get-usage-cache.ts';
import { getUsageDir } from './get-usage-dir.ts';

const lastAt = z.object({ at: z.string().nullable() });

// One usage_samples row per account whose claude-usage/<account>.json is newer than that account's
// last row (at = the file's mtime). A file counts only when its account is 12 hex characters and
// equals the file's base name; others are skipped without a word. With no such folder or no
// .json in it, the old single file is read as before: one row when it differs from the last row
// stored, or names another account than it does (A, then B, then A again with the same figures is
// 3 rows). A missing or unreadable file, or one with no percentages, is skipped without a word.
export function sampleUsage(db: Database, at: Date = now()): boolean {
  const f = getUsageCache(),
    insert = db.query('INSERT OR IGNORE INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)');
  let files: string[] = [];
  try {
    files = readdirSync(getUsageDir()).filter((name) => name.endsWith('.json'));
  } catch {}
  if (files.length) {
    let stored = false;
    for (const name of files.toSorted()) {
      const key = name.slice(0, -5);
      const reading = readAccountFile(`${getUsageDir()}/${name}`, key);
      if (!reading) {
        continue;
      }

      // Outside the file read's catch: a failed query or insert reaches the caller.
      const last = lastAt.parse(db.query('SELECT MAX(at) AS at FROM usage_samples WHERE account = ?').get(key));
      if (last.at !== null && reading.when <= last.at) {
        continue;
      }
      if (insert.run(reading.when, key, reading.five, reading.seven, reading.fiveResetsAt, reading.sevenResetsAt).changes > 0) {
        stored = true;
      }
    }
    return stored;
  }
  if (!existsSync(f)) return false;
  const r = readings(f);
  if (!r) return false;
  const account = typeof r.account === 'string' && ACCOUNT_KEY.test(r.account) ? r.account : 'active';
  const last = db.query('SELECT account, five_hour, seven_day FROM usage_samples ORDER BY at DESC LIMIT 1').get() as { account: string; five_hour: number | null; seven_day: number | null } | null;
  if (last && last.account === account && last.five_hour === r.five && last.seven_day === r.seven) return false;
  return insert.run(iso(at), account, r.five, r.seven, r.fiveResetsAt, r.sevenResetsAt).changes > 0;
}

interface WindowResets {
  fiveResetsAt: string | null;
  sevenResetsAt: string | null;
}

// One account's file: its percentages and its mtime, or null when the file is unreadable, holds no
// usable percentage, or names another account than its base name.
function readAccountFile(file: string, key: string): (WindowResets & { five: number | null; seven: number | null; when: string }) | null {
  const reading = ACCOUNT_KEY.test(key) ? readings(file) : null;
  if (!reading || reading.account !== key) {
    return null;
  }
  try {
    return { five: reading.five, seven: reading.seven, fiveResetsAt: reading.fiveResetsAt, sevenResetsAt: reading.sevenResetsAt, when: iso(new Date(statSync(file).mtimeMs)) };
  } catch {
    return null;
  }
}

const WINDOW_PAIR = z.object({ fiveHour: z.unknown(), sevenDay: z.unknown() }).partial();

const CACHE_FILE = z.object({ account: z.unknown(), windows: WINDOW_PAIR, resets: WINDOW_PAIR }).partial();

// The two percentages of a cache file and each window's reset time, or null when it holds no usable
// percentage. A reset that is not an ISO time is left out.
function readings(file: string): (WindowResets & { account: unknown; five: number | null; seven: number | null }) | null {
  try {
    const parsed = CACHE_FILE.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) {
      return null;
    }
    const cacheFile = parsed.data;
    const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1000;
    const five = ok(cacheFile.windows?.fiveHour) ? cacheFile.windows.fiveHour : null;
    const seven = ok(cacheFile.windows?.sevenDay) ? cacheFile.windows.sevenDay : null;
    const resets = { fiveResetsAt: readResetTime(cacheFile.resets?.fiveHour), sevenResetsAt: readResetTime(cacheFile.resets?.sevenDay) };
    return five === null && seven === null ? null : { account: cacheFile.account, five, seven, ...resets };
  } catch {
    return null;
  }
}

function readResetTime(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return iso(new Date(value));
}
