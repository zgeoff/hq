import type { Database } from 'bun:sqlite';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { ACCOUNT_KEY } from './account-key.ts';
import { getUsageCache } from './get-usage-cache.ts';
import { getUsageDir } from './get-usage-dir.ts';

// One usage_samples row per account whose claude-usage/<account>.json is newer than that account's
// last row (at = the file's mtime). A file counts only when its account is 12 hex characters and
// equals the file's base name; others are skipped without a word. With no such folder or no
// .json in it, the old single file is read as before: one row when it differs from the last row
// stored, or names another account than it does (A, then B, then A again with the same figures is
// 3 rows). A missing or unreadable file, or one with no percentages, is skipped without a word.
export function sampleUsage(db: Database, at: Date = now()): boolean {
  const f = getUsageCache(),
    insert = db.query('INSERT OR IGNORE INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)');
  let files: string[] = [];
  try {
    files = readdirSync(getUsageDir()).filter((name) => name.endsWith('.json'));
  } catch {}
  if (files.length) {
    let stored = false;
    for (const name of files.toSorted()) {
      const key = name.slice(0, -5);
      try {
        const file = `${getUsageDir()}/${name}`;
        const r = ACCOUNT_KEY.test(key) ? readings(file) : null;
        if (!r || r.account !== key) continue;
        const when = iso(new Date(statSync(file).mtimeMs));
        const last = (db.query('SELECT MAX(at) AS at FROM usage_samples WHERE account = ?').get(key) as { at: string | null }).at;
        if (last !== null && when <= last) continue;
        if (insert.run(when, key, r.five, r.seven).changes > 0) stored = true;
      } catch {}
    }
    return stored;
  }
  if (!existsSync(f)) return false;
  const r = readings(f);
  if (!r) return false;
  const account = typeof r.account === 'string' && ACCOUNT_KEY.test(r.account) ? r.account : 'active';
  const last = db.query('SELECT account, five_hour, seven_day FROM usage_samples ORDER BY at DESC LIMIT 1').get() as { account: string; five_hour: number | null; seven_day: number | null } | null;
  if (last && last.account === account && last.five_hour === r.five && last.seven_day === r.seven) return false;
  return insert.run(iso(at), account, r.five, r.seven).changes > 0;
}

// The two percentages of a cache file, or null when it holds no usable one.
function readings(file: string): { account: unknown; five: number | null; seven: number | null } | null {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { account?: unknown; windows?: { fiveHour?: unknown; sevenDay?: unknown } };
    const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1000;
    const five = ok(j?.windows?.fiveHour) ? j.windows.fiveHour : null;
    const seven = ok(j?.windows?.sevenDay) ? j.windows.sevenDay : null;
    return five === null && seven === null ? null : { account: j.account, five, seven };
  } catch {
    return null;
  }
}
