import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { isInScope } from '../scope/is-in-scope.ts';
import { ISO_Z } from './iso-z.ts';
import { readGhJSON } from './read-gh-json.ts';
import { NAME } from './name.ts';
import { toUTCDay } from './to-utc-day.ts';
import { upsertGoalDay } from './upsert-goal-day.ts';

const PagesSchema = z.array(z.unknown());
const PageSchema = z.object({ total_count: z.number().int().safe().min(0), items: z.array(z.unknown()), incomplete_results: z.unknown().optional() });
const ItemSchema = z.object({ number: z.number().int().safe().min(1), closed_at: z.string().regex(ISO_Z), repository_url: z.string() });

export async function syncClosedDay(db: Database, run: Runner, day: string, env?: RunOpts['env'], at: Date = now()): Promise<number> {
  const query = `org:zgeoff is:pr is:closed is:unmerged closed:${day}T00:00:00Z..${day}T23:59:59Z`;
  const raw = await readGhJSON(run, ['api', '-X', 'GET', 'search/issues', '-f', `q=${query}`, '-f', 'per_page=100', '--paginate', '--slurp'], env, `closed PRs on ${day}`);
  const pages = PagesSchema.safeParse(raw);
  if (!pages.success) {
    throw new HqError('command_failed', `closed PRs on ${day}: not a page list`);
  }
  const items: { repo: string; number: number; closed_at: string }[] = [];
  for (const rawPage of pages.data) {
    const page = PageSchema.safeParse(rawPage);
    if (!page.success) {
      throw new HqError('command_failed', `closed PRs on ${day}: not a search page`);
    }
    // A search that timed out on GitHub's side lists only part: not stored, so the day is fetched again.
    if (page.data.incomplete_results !== false) {
      throw new HqError('command_failed', `closed PRs on ${day}: GitHub's search was incomplete; not recorded`);
    }
    if (page.data.total_count > 1000) {
      throw new HqError('too_many', `${day} has ${page.data.total_count} closed PRs; not recorded`);
    }
    for (const rawItem of page.data.items) {
      const item = ItemSchema.safeParse(rawItem);
      if (!item.success || item.data.closed_at.slice(0, 10) !== day) {
        throw new HqError('command_failed', `closed PRs on ${day}: a row hq can't read; not recorded`);
      }
      const repo = item.data.repository_url.split('/').at(-1) ?? '';
      if (!NAME.test(repo) || /^\.+$/u.test(repo)) {
        throw new HqError('command_failed', `closed PRs on ${day}: a row hq can't read; not recorded`);
      }
      if (isInScope(repo)) {
        items.push({ repo, number: item.data.number, closed_at: item.data.closed_at });
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
