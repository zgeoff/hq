import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { isInScope } from '../scope/is-in-scope.ts';
import { ISO_Z } from './iso-z.ts';
import { readGhJSON } from './read-gh-json.ts';
import { NAME } from './name.ts';
import { toUTCDay } from './to-utc-day.ts';
import { upsertGoalDay } from './upsert-goal-day.ts';

// PRs closed without merging on one UTC day, all zgeoff repos (the search API: 30 a minute).
export async function syncClosedDay(db: Database, run: Runner, day: string, env?: RunOpts['env'], at: Date = now()): Promise<number> {
  const q = `org:zgeoff is:pr is:closed is:unmerged closed:${day}T00:00:00Z..${day}T23:59:59Z`,
    raw = await readGhJSON(run, ['api', '-X', 'GET', 'search/issues', '-f', `q=${q}`, '-f', 'per_page=100', '--paginate', '--slurp'], env, `closed PRs on ${day}`);
  if (!Array.isArray(raw)) throw new HqError('command_failed', `closed PRs on ${day}: not a page list`);
  const items: { repo: string; number: number; closed_at: string }[] = [];
  for (const page of raw as { total_count?: unknown; items?: unknown; incomplete_results?: unknown }[]) {
    if (!Number.isSafeInteger(page.total_count) || (page.total_count as number) < 0 || !Array.isArray(page.items)) throw new HqError('command_failed', `closed PRs on ${day}: not a search page`);
    // A search that timed out on GitHub's side lists only part: not stored, so the day is fetched again.
    if (page.incomplete_results !== false) throw new HqError('command_failed', `closed PRs on ${day}: GitHub's search was incomplete; not recorded`);
    if ((page.total_count as number) > 1000) throw new HqError('too_many', `${day} has ${page.total_count} closed PRs; not recorded`);
    for (const x of page.items as { number?: unknown; closed_at?: unknown; repository_url?: unknown }[]) {
      const repo = typeof x.repository_url === 'string' ? x.repository_url.split('/').pop()! : '';
      if (!Number.isSafeInteger(x.number) || (x.number as number) < 1 || typeof x.closed_at !== 'string' || !ISO_Z.test(x.closed_at) || x.closed_at.slice(0, 10) !== day || !NAME.test(repo) || /^\.+$/.test(repo)) {
        throw new HqError('command_failed', `closed PRs on ${day}: a row hq can't read; not recorded`);
      }
      if (isInScope(repo)) {
        items.push({ repo, number: x.number as number, closed_at: x.closed_at });
      }
    }
  }
  db.transaction(() => {
    const up = db.query('INSERT INTO closed_prs (repo, number, closed_at) VALUES (?, ?, ?) ON CONFLICT (repo, number) DO UPDATE SET closed_at = excluded.closed_at');
    for (const i of items) up.run(i.repo, i.number, i.closed_at);
    if (toUTCDay(at.getTime()) > day) {
      upsertGoalDay(db, { kind: 'closed', key: '*', day, n: items.length, at });
    }
  }).immediate();
  return items.length;
}
