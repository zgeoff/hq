// The repo name being left and the one being taken.
export interface RepoNames {
  from: string;
  to: string;
}

// How a stored value names the repo: the whole value (name), zgeoff/<name> (slug), <name>#<number>
// (ref), or a start of https://github.com/zgeoff/<name>/ (url).
export type RekeyKind = 'name' | 'slug' | 'ref' | 'url';

export interface RekeySpec {
  column: string;
  kind: RekeyKind;

  // The other columns that, with this one, make a unique key of the table; null when no unique key
  // holds the column, so a re-key cannot collide.
  key: string[] | null;

  // The meta row whose value is a JSON object keyed by this kind: the re-key changes the keys of
  // that object, and two keys of the object that would repeat collide.
  metaKey?: string;

  // The key columns the unique index reads as COALESCE(column, 0), so a null and a 0 repeat.
  zeroIfNull?: string[];
  table: string;
}

export type RekeyStore = 'hq' | 'noslop';

// Found by scanning a copy of the live databases. Free text and hq's own scope stay out: events,
// asks, mark text and kind, news text, run notes and typed text name the tool or quote people.
export const REKEY_SPECS: Record<RekeyStore, RekeySpec[]> = {
  hq: [
    { table: 'ci_runs', column: 'repo', kind: 'name', key: null },
    { table: 'closed_prs', column: 'repo', kind: 'name', key: ['number'] },
    { table: 'merged_prs', column: 'repo', kind: 'name', key: ['number'] },
    { table: 'noslop_rounds', column: 'repo', kind: 'name', key: null },
    { table: 'pr_status', column: 'repo', kind: 'name', key: ['pr'] },
    { table: 'goal_days', column: 'key', kind: 'name', key: ['kind', 'day'] },
    { table: 'umbrella_boxes', column: 'repo', kind: 'name', key: ['number', 'issue'] },
    { table: 'run_prs', column: 'ref', kind: 'ref', key: [] },
    { table: 'run_prs', column: 'fixed_in_pr', kind: 'ref', key: null },
    { table: 'grant_actions', column: 'target', kind: 'ref', key: null },
    { table: 'marks', column: 'ref', kind: 'url', key: null },
    { table: 'news', column: 'link', kind: 'url', key: null },
    { table: 'meta', column: 'value', kind: 'ref', key: null, metaKey: 'stats_pr_facts_v2' },
  ],
  noslop: [
    { table: 'reviews', column: 'repo', kind: 'slug', key: null },
    { table: 'dispositions', column: 'repo', kind: 'slug', key: ['pull_request', 'finding_id', 'source', 'at'], zeroIfNull: ['pull_request'] },
    { table: 'escapes', column: 'repo', kind: 'slug', key: null },
    { table: 'findings', column: 'comment_url', kind: 'url', key: null },
  ],
};
