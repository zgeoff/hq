import type { Database } from 'bun:sqlite';
import { Database as SqliteDatabase } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// noslop's store as its migrations leave it, for the four tables a re-key touches.
const AT = '2026-10-01T00:00:00Z',
  STORE_DDL = `
  CREATE TABLE reviews (
    review_id TEXT PRIMARY KEY, repo TEXT NOT NULL, pull_request INTEGER, base TEXT NOT NULL, head TEXT NOT NULL,
    title TEXT, depth TEXT NOT NULL, special TEXT, risk_classes TEXT NOT NULL, lenses TEXT NOT NULL,
    config_hash TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT NOT NULL
  );
  CREATE TABLE findings (
    review_id TEXT NOT NULL REFERENCES reviews (review_id) ON DELETE CASCADE, finding_id TEXT NOT NULL,
    lens TEXT NOT NULL, call_id TEXT, title TEXT NOT NULL, body TEXT NOT NULL, path TEXT NOT NULL,
    start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, second_location TEXT, severity TEXT NOT NULL,
    criterion TEXT NOT NULL, rule TEXT, verdict TEXT NOT NULL, unverified_fact TEXT,
    written_by_change INTEGER NOT NULL, risk_class TEXT, fix TEXT, depth TEXT NOT NULL, model TEXT,
    effort TEXT, comment_url TEXT,
    CONSTRAINT findings_pk PRIMARY KEY (review_id, finding_id)
  );
  CREATE TABLE dispositions (
    repo TEXT NOT NULL, finding_id TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, author TEXT NOT NULL,
    author_is_owner INTEGER NOT NULL, source TEXT NOT NULL, at TEXT NOT NULL, pull_request INTEGER
  );
  CREATE UNIQUE INDEX dispositions_key ON dispositions (repo, COALESCE(pull_request, 0), finding_id, source, at);
  CREATE TABLE escapes (
    escape_id TEXT PRIMARY KEY, repo TEXT NOT NULL, issue TEXT NOT NULL, head TEXT NOT NULL, lens TEXT,
    defect TEXT NOT NULL, path TEXT, start_line INTEGER, end_line INTEGER, recorded_at TEXT NOT NULL
  );
`;

export function createStoreTables(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const store = new SqliteDatabase(path, { create: true });
  store.exec(STORE_DDL);
  store.close();
}

// One row in each re-keyed column of hq.db that names `repo`, with keys that start at `offset`, so
// two repos never share a key; and rows that only look like the repo, which a re-key must leave.
export function createHistoryRows(db: Database, repo: string, offset: number): void {
  db.query('INSERT INTO ci_runs (id, repo, path, event, status, attempt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(offset + 1, repo, 'ci.yml', 'push', 'completed', 1, AT, AT);
  db.query('INSERT INTO closed_prs (repo, number, closed_at) VALUES (?, ?, ?)').run(repo, offset + 1, AT);
  db.query('INSERT INTO merged_prs (repo, number, merged_at, title, kind) VALUES (?, ?, ?, ?, ?)').run(repo, offset + 2, AT, 'feat: an invented change', 'feat');
  db.query('INSERT INTO noslop_rounds (id, repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(offset + 1, repo, offset + 3, 'review', AT, AT, 5, 1, 'abc1234');
  db.query('INSERT INTO pr_status (repo, pr, updated_at) VALUES (?, ?, ?)').run(repo, offset + 4, AT);
  db.query('INSERT INTO goal_days (kind, key, day, n, at) VALUES (?, ?, ?, ?, ?)').run('ci', repo, `2026-${10 + offset / 100}-01`, 3, AT);
  db.query("INSERT OR IGNORE INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-1', 'An invented run', 'local', 'working', ?, ?)").run(AT, AT);
  db.query("INSERT INTO run_prs (ref, issue, state, fixed_in_pr, added_at, updated_at) VALUES (?, 'GEO-1', 'open', ?, ?, ?)").run(`${repo}#${offset + 5}`, `${repo}#${offset + 6}`, AT, AT);
  db.query("INSERT INTO grant_actions (grant_name, target, actor, at) VALUES ('kettle', ?, 'z-qa', ?)").run(`${repo}#${offset + 7}`, AT);
  db.query("INSERT INTO marks (at, kind, text, ref, added_by, added_at) VALUES (?, 'hq', ?, ?, 'z-stu', ?)").run(AT, `changed ${repo} and the hq tool`, `https://github.com/zgeoff/${repo}/pull/${offset + 8}`, AT);
  db.query("INSERT INTO news (from_name, topic, text, link, added_at) VALUES ('z-stu', 'merge', ?, ?, ?)").run(`merged a change to hq itself, ${repo}`, `https://github.com/zgeoff/${repo}/pull/${offset + 9}`, AT);
}

// Rows that look like a repo called hq and are not it, in the same columns.
export function createLookalikeRows(db: Database): void {
  db.query('INSERT INTO ci_runs (id, repo, path, event, status, attempt, created_at, updated_at) VALUES (900, ?, ?, ?, ?, ?, ?, ?)').run('hq-tools', 'ci.yml', 'push', 'completed', 1, AT, AT);
  db.query("INSERT INTO grant_actions (grant_name, target, actor, at) VALUES ('kettle', 'hq#abc', 'z-qa', ?)").run(AT);
  db.query("INSERT INTO grant_actions (grant_name, target, actor, at) VALUES ('kettle', 'hq-old#4', 'z-qa', ?)").run(AT);
  db.query("INSERT INTO marks (at, kind, text, ref, added_by, added_at) VALUES (?, 'hq', 'a lookalike', 'https://github.com/other/hq/pull/5', 'z-stu', ?)").run(AT, AT);
  db.query("INSERT INTO news (from_name, topic, text, link, added_at) VALUES ('z-stu', 'merge', 'a lookalike', 'https://github.com/zgeoff/hq-tools/pull/6', ?)").run(AT);
  db.query("INSERT INTO events (subject, subject_id, action, actor, at, data) VALUES ('hq', 'hq', 'noted', 'hq', ?, '{\"note\":\"hq\"}')").run(AT);
}

// The same for noslop's store, with finding ids that start at `offset`.
export function createStoreRows(path: string, repo: string, offset: number): void {
  const finding = `f${offset + 1}`,
    review = `r${offset + 1}`,
    slug = `zgeoff/${repo}`,
    store = new SqliteDatabase(path);
  store.query("INSERT INTO reviews (review_id, repo, pull_request, base, head, depth, risk_classes, lenses, config_hash, started_at, ended_at) VALUES (?, ?, 1, 'b', 'h', 'high', '[]', '[]', 'c', ?, ?)").run(review, slug, AT, AT);
  store
    .query("INSERT INTO findings (review_id, finding_id, lens, title, body, path, start_line, end_line, severity, criterion, verdict, written_by_change, depth, comment_url) VALUES (?, ?, 'design', 't', 'b', 'p', 1, 2, 'P2', 'c', 'v', 0, 'high', ?)")
    .run(review, finding, `https://github.com/zgeoff/${repo}/pull/1#discussion_r1`);
  store.query("INSERT INTO dispositions (repo, finding_id, kind, value, author, author_is_owner, source, at, pull_request) VALUES (?, ?, 'fixed', 'x', 'a', 1, 's', ?, 1)").run(slug, finding, AT);
  store.query("INSERT INTO escapes (escape_id, repo, issue, head, defect, recorded_at) VALUES (?, ?, 'GEO-9', 'h', 'd', ?)").run(`e${offset + 1}`, slug, AT);
  store.close();
}
