export interface RepoNames {
  from: string;
  to: string;
}

export type RekeyKind = 'name' | 'slug' | 'ref' | 'url';

export interface RekeySpec {
  column: string;
  kind: RekeyKind;

  key: string[] | null;

  metaKey?: string;

  zeroIfNull?: string[];
  table: string;
}

export type RekeyStore = 'hq' | 'noslop';

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
