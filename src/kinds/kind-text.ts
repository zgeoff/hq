import type { IssueType } from '../linear/issue-types.ts';
import type { Kind } from './kinds.ts';
import { TYPE_COLS } from './type-cols.ts';
import type { KindWeek } from './types.ts';

const SHOWN: Kind[] = ['fix', 'feat', 'chore', 'docs', 'test', 'refactor', 'other'];
const SHORT: Record<IssueType, string> = { Bug: 'bug', Feature: 'feature', Improvement: 'improve', Chore: 'chore', Design: 'design', Investigation: 'investig', none: 'no type' };

export function kindText(weeks: KindWeek[], linear: { syncedAt: string | null; error: string | null }): string[] {
  const head = 'Bug share by week (the owner asks: is the bug-fix share falling?). Weeks start Monday 00:00 Sydney.';
  const day = (t: string) => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: 'short' }).format(new Date(t));
  const label = (w: KindWeek) => `  ${`${day(w.from)}${w.partial ? ' so far' : ''}`.padEnd(16)}`;
  const share = (x: number | null) => (x === null ? '–' : `${x}`).padStart(7);
  const out = [head];
  if (!weeks.some((w) => w.total)) out.push('  no merged PRs recorded yet: hq kinds sync --weeks 8');
  else {
    const rest = (w: KindWeek) => w.total - SHOWN.reduce((a, k) => a + w.kinds[k], 0);
    out.push(
      '  Merged PRs by title kind (fix: ..., feat: ...; an area prefix such as "runs:" is other). Bug % = fix / all.',
      `  ${'week of'.padEnd(16)}${'all'.padStart(5)}${SHOWN.map((k) => k.padStart(9)).join('')}${'ci etc'.padStart(8)}${'bug %'.padStart(7)}`,
      ...weeks.map((w) => `${label(w)}${String(w.total).padStart(5)}${SHOWN.map((k) => String(w.kinds[k]).padStart(9)).join('')}${String(rest(w)).padStart(8)}${share(w.bugShare)}${w.missingDays ? ` (${w.missingDays} day(s) not synced)` : ''}`),
    );
  }
  const cols = `${TYPE_COLS.map((t) => SHORT[t].padStart(9)).join('')}`;
  if (!linear.syncedAt) {
    out.push(`  Linear issue types: not read yet${linear.error ? ` (${linear.error.slice(0, 160)})` : ''}: hq kinds sync --weeks 8`);
    return out;
  }
  out.push(
    `  Merged PRs by their Linear issue's Type label (the PR body's Fixes/Contributes to/Related to line). Bug % = Bug / PRs with an issue.`,
    `  ${'week of'.padEnd(16)}${'issue'.padStart(6)}${'none'.padStart(6)}${cols}${'bug %'.padStart(7)}`,
    ...weeks.map((w) => `${label(w)}${String(w.total - w.prUnlinked).padStart(6)}${String(w.prUnlinked).padStart(6)}${TYPE_COLS.map((t) => String(w.prTypes[t]).padStart(9)).join('')}${share(w.prBugShare)}`),
    `  Linear issues completed, by Type label, in the Sydney week they closed. Bug % = Bug / completed.`,
    `  ${'week of'.padEnd(16)}${'done'.padStart(6)}${'cancel'.padStart(7)}${cols}${'bug %'.padStart(7)}`,
    ...weeks.map((w) => `${label(w)}${String(TYPE_COLS.reduce((a, t) => a + w.issues[t], 0)).padStart(6)}${String(w.canceled).padStart(7)}${TYPE_COLS.map((t) => String(w.issues[t]).padStart(9)).join('')}${share(w.issueBugShare)}`),
    `  (Linear read ${linear.syncedAt.slice(0, 16)}Z${linear.error ? `; last error: ${linear.error.slice(0, 160)}` : ''})`,
  );
  return out;
}
