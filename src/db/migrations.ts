// Append only; never edit a shipped entry.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE asks (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('call', 'proposal')),
    title        TEXT NOT NULL,
    question     TEXT NOT NULL,
    body         TEXT NOT NULL,
    issues       TEXT NOT NULL DEFAULT '[]',
    filed_by     TEXT NOT NULL,
    for_session  TEXT,
    state        TEXT NOT NULL CHECK (state IN ('queued','open','answered','applied','later','skipped','closed')),
    round        INTEGER NOT NULL DEFAULT 1,
    due_at       TEXT,
    answer       TEXT,
    answered_at  TEXT,
    applied_to   TEXT,
    applied_note TEXT,
    applied_at   TEXT,
    close_reason TEXT,
    queued_at    TEXT NOT NULL,
    opened_at    TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  -- One open question to the owner at a time, across calls and proposals.
  CREATE UNIQUE INDEX asks_one_open ON asks (state) WHERE state = 'open';

  CREATE TABLE unblocks (
    id         TEXT PRIMARY KEY,
    task       TEXT NOT NULL,
    minutes    INTEGER,
    unblocks   TEXT NOT NULL DEFAULT '[]',
    rank       INTEGER,
    notify     TEXT NOT NULL DEFAULT '[]',
    added_by   TEXT NOT NULL,
    state      TEXT NOT NULL CHECK (state IN ('open','done','dropped')),
    added_seq  INTEGER NOT NULL,
    added_at   TEXT NOT NULL,
    closed_at  TEXT,
    note       TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE events (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    subject    TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    action     TEXT NOT NULL,
    from_state TEXT,
    to_state   TEXT,
    actor      TEXT NOT NULL,
    at         TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX events_subject ON events (subject, subject_id);

  CREATE TABLE outbox (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_seq  INTEGER NOT NULL REFERENCES events (seq),
    target     TEXT NOT NULL,
    text       TEXT NOT NULL,
    idem_key   TEXT NOT NULL UNIQUE,
    status     TEXT NOT NULL CHECK (status IN ('pending','sent','failed')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    message_id TEXT,
    created_at TEXT NOT NULL,
    sent_at    TEXT
  );
  `,
  `ALTER TABLE asks ADD COLUMN send_order INTEGER;`,
  `CREATE TABLE wake_list (
    session_id TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    note       TEXT,
    added_by   TEXT NOT NULL,
    added_at   TEXT NOT NULL
  );`,
  `CREATE TABLE lanes_samples (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL,
    free_mib  INTEGER,
    slots     INTEGER NOT NULL,
    eligible  INTEGER,
    error     TEXT
  );
  CREATE TABLE lanes_nudges (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    at           TEXT NOT NULL,
    slots        INTEGER NOT NULL,
    free_minutes INTEGER NOT NULL,
    eligible     INTEGER,
    event_seq    INTEGER NOT NULL,
    slots_after  INTEGER,
    checked_at   TEXT
  );`,
  `ALTER TABLE outbox ADD COLUMN topic TEXT;
  UPDATE outbox SET topic = 'lanes' WHERE event_seq IN
    (SELECT seq FROM events WHERE subject = 'hq' AND subject_id = 'lanes' AND action = 'nudged');
  UPDATE outbox SET topic = 'queue-reminder' WHERE event_seq IN (SELECT seq FROM events WHERE action = 'reminded');
  CREATE TABLE runs (
    issue       TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    place       TEXT NOT NULL CHECK (place IN ('local', 'imp', 'none')),
    state       TEXT NOT NULL CHECK (state IN ('working','blocked','merged','deploying','deploy-held','live-check','done','dropped')),
    next        TEXT NOT NULL DEFAULT '',
    gate        TEXT,
    geoff_chat  INTEGER NOT NULL DEFAULT 0,
    waits_on    TEXT,
    close_note  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    closed_at   TEXT
  );
  CREATE TABLE run_sessions (
    session_id TEXT PRIMARY KEY,
    issue      TEXT NOT NULL REFERENCES runs (issue),
    active     INTEGER NOT NULL DEFAULT 1,
    added_at   TEXT NOT NULL,
    ended_at   TEXT
  );
  CREATE UNIQUE INDEX run_sessions_one_active ON run_sessions (issue) WHERE active = 1;
  CREATE TABLE run_prs (
    ref               TEXT PRIMARY KEY,
    issue             TEXT NOT NULL REFERENCES runs (issue),
    url               TEXT,
    state             TEXT NOT NULL CHECK (state IN ('open','merged','closed')),
    final_sha         TEXT,
    final_at          TEXT,
    final_source      TEXT,
    review_started_at TEXT,
    reviewed_sha      TEXT,
    review_round      INTEGER NOT NULL DEFAULT 0,
    reviewed_at       TEXT,
    merged_at         TEXT,
    added_at          TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE TABLE run_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    issue      TEXT NOT NULL REFERENCES runs (issue),
    session_id TEXT,
    label      TEXT,
    text       TEXT NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('atc', 'cli')),
    event_key  TEXT UNIQUE,
    at         TEXT NOT NULL
  );
  CREATE INDEX run_notes_issue ON run_notes (issue, id);
  CREATE TABLE run_alerts (
    key         TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    sent_at     TEXT NOT NULL,
    event_seq   INTEGER
  );`,
  `DROP INDEX run_sessions_one_active;
  ALTER TABLE run_sessions ADD COLUMN helper INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX run_sessions_one_main ON run_sessions (issue) WHERE active = 1 AND helper = 0;`,

  `CREATE TABLE news (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_name   TEXT NOT NULL,
    topic       TEXT NOT NULL CHECK (topic IN ('merge', 'release', 'deploy', 'fix', 'other')),
    text        TEXT NOT NULL,
    issue       TEXT,
    link        TEXT,
    needs_geoff INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL,
    read_at     TEXT
  );
  CREATE INDEX news_unread ON news (read_at, id);`,

  `CREATE TABLE marks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    at       TEXT NOT NULL,
    kind     TEXT NOT NULL CHECK (kind IN ('skills', 'grant', 'hq', 'other')),
    text     TEXT NOT NULL,
    ref      TEXT,
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL
  );
  CREATE INDEX marks_at ON marks (at);
  ALTER TABLE runs ADD COLUMN ready_since TEXT;
  ALTER TABLE runs ADD COLUMN waits_on_geoff INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE runs ADD COLUMN size TEXT CHECK (size IN ('S', 'M', 'L', 'XL'));
  ALTER TABLE runs ADD COLUMN size_lines INTEGER;`,

  `CREATE TABLE typed (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    to_session  TEXT NOT NULL,
    to_id       TEXT,
    to_name     TEXT,
    text        TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('call', 'proposal', 'chat')),
    source_ref  TEXT NOT NULL,
    source_at   TEXT,
    typed_by    TEXT NOT NULL,
    at          TEXT NOT NULL
  );
  CREATE INDEX typed_to ON typed (to_id, id);`,
  `ALTER TABLE run_prs ADD COLUMN fixed_in_pr INTEGER;
  ALTER TABLE run_prs ADD COLUMN tally_at TEXT;
  CREATE TABLE followups (
    issue    TEXT PRIMARY KEY,
    from_ref TEXT,
    filed_at TEXT NOT NULL,
    source   TEXT NOT NULL CHECK (source IN ('final', 'linear backfill')),
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL
  );
  CREATE INDEX followups_filed ON followups (filed_at);`,
  `CREATE TABLE job_runs (
    job        TEXT NOT NULL,
    key        TEXT NOT NULL,
    at         TEXT NOT NULL,
    result     TEXT NOT NULL CHECK (result IN ('queued', 'skipped')),
    detail     TEXT,
    outbox_key TEXT,
    PRIMARY KEY (job, key)
  );`,
  `ALTER TABLE runs ADD COLUMN lane TEXT;
  UPDATE runs SET lane = (
    SELECT lower(trim(n.text)) FROM run_notes n WHERE n.issue = runs.issue AND n.label = 'lane' ORDER BY n.id DESC LIMIT 1
  ) WHERE lane IS NULL;
  UPDATE runs SET lane = NULL WHERE lane IS NOT NULL AND (lane = '' OR lane GLOB '*[^a-z0-9-]*' OR length(lane) > 40);
  UPDATE runs SET lane = 'flexible' WHERE lane IS NULL AND place = 'local';
  ALTER TABLE lanes_nudges ADD COLUMN detail TEXT;`,
  `CREATE TABLE merged_prs (
    repo       TEXT NOT NULL,
    number     INTEGER NOT NULL,
    merged_at  TEXT NOT NULL,
    title      TEXT NOT NULL,
    kind       TEXT NOT NULL,
    issue      TEXT,
    PRIMARY KEY (repo, number)
  );
  CREATE INDEX merged_prs_at ON merged_prs (merged_at);
  CREATE TABLE merged_pr_days (
    day TEXT PRIMARY KEY,
    n   INTEGER NOT NULL,
    at  TEXT NOT NULL
  );
  CREATE TABLE linear_issues (
    issue      TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    state      TEXT NOT NULL CHECK (state IN ('completed', 'canceled', 'open')),
    closed_at  TEXT,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX linear_issues_closed ON linear_issues (closed_at);`,

  // SQLite can't change a CHECK, so the news table is rebuilt with every row and its id sequence kept;
  // nothing references news.
  `CREATE TABLE news_v15 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_name   TEXT NOT NULL,
    topic       TEXT NOT NULL CHECK (topic IN ('merge', 'release', 'deploy', 'fix', 'report', 'other')),
    text        TEXT NOT NULL,
    issue       TEXT,
    link        TEXT,
    needs_geoff INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL,
    read_at     TEXT
  );
  INSERT INTO news_v15 (id, from_name, topic, text, issue, link, needs_geoff, added_at, read_at)
    SELECT id, from_name, topic, text, issue, link, needs_geoff, added_at, read_at FROM news;
  CREATE TEMP TABLE news_seq AS SELECT seq FROM sqlite_sequence WHERE name = 'news';
  DROP TABLE news;
  ALTER TABLE news_v15 RENAME TO news;
  UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM news_seq), 0)) WHERE name = 'news';
  INSERT INTO sqlite_sequence (name, seq) SELECT 'news', seq FROM news_seq WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'news');
  DROP TABLE news_seq;
  CREATE INDEX news_unread ON news (read_at, id);`,
  `CREATE TABLE ci_runs (
    id         INTEGER PRIMARY KEY,
    repo       TEXT NOT NULL,
    path       TEXT NOT NULL,
    event      TEXT NOT NULL,
    status     TEXT NOT NULL,
    conclusion TEXT,
    attempt    INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX ci_runs_created ON ci_runs (created_at);
  CREATE TABLE closed_prs (
    repo      TEXT NOT NULL,
    number    INTEGER NOT NULL,
    closed_at TEXT NOT NULL,
    PRIMARY KEY (repo, number)
  );
  CREATE INDEX closed_prs_at ON closed_prs (closed_at);
  CREATE TABLE goal_days (
    kind TEXT NOT NULL CHECK (kind IN ('ci', 'closed')),
    key  TEXT NOT NULL,
    day  TEXT NOT NULL,
    n    INTEGER NOT NULL,
    at   TEXT NOT NULL,
    PRIMARY KEY (kind, key, day)
  );`,
  `CREATE TABLE probe_samples (
    at         TEXT PRIMARY KEY,
    target_ok  INTEGER NOT NULL,
    control_ok INTEGER,
    ms         INTEGER,
    detail     TEXT
  );
  CREATE TABLE outages (
    id           INTEGER PRIMARY KEY,
    started_at   TEXT NOT NULL,
    detected_at  TEXT NOT NULL,
    ended_at     TEXT,
    alert_seq    INTEGER,
    recover_seq  INTEGER
  );
  CREATE UNIQUE INDEX outages_one_open ON outages ((1)) WHERE ended_at IS NULL;`,
  `ALTER TABLE news ADD COLUMN tag TEXT;
  CREATE TABLE usage_samples (
    at        TEXT NOT NULL,
    account   TEXT NOT NULL,
    five_hour REAL,
    seven_day REAL,
    PRIMARY KEY (at, account)
  );`,
  `ALTER TABLE probe_samples ADD COLUMN ready_ok INTEGER;
  ALTER TABLE outages ADD COLUMN kind TEXT NOT NULL DEFAULT 'down' CHECK (kind IN ('down', 'unready'));
  DROP INDEX outages_one_open;
  CREATE UNIQUE INDEX outages_one_open ON outages (kind) WHERE ended_at IS NULL;`,
  `ALTER TABLE runs ADD COLUMN live_check TEXT CHECK (live_check IN ('owed','none'));
  ALTER TABLE run_prs ADD COLUMN merge_sha TEXT;
  ALTER TABLE run_prs ADD COLUMN shipped_tag TEXT;
  ALTER TABLE run_prs ADD COLUMN shipped_at TEXT;`,
  `CREATE TABLE deploy_runs (
    run_id           INTEGER PRIMARY KEY,
    outcome          TEXT NOT NULL CHECK (outcome IN ('applied_ok', 'applied_failed', 'held', 'no_apply', 'cancelled', 'unknown')),
    attempt          INTEGER NOT NULL,
    apply_conclusion TEXT,
    failed_step      TEXT,
    fetched_at       TEXT NOT NULL
  );`,
  `CREATE TABLE refusal_files (
    path   TEXT PRIMARY KEY,
    offset INTEGER NOT NULL,
    size   INTEGER NOT NULL,
    mtime  TEXT NOT NULL,
    tools  TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE refusals (
    uuid           TEXT PRIMARY KEY,
    at             TEXT NOT NULL,
    claude_session TEXT,
    transcript     TEXT NOT NULL,
    subagent       INTEGER NOT NULL CHECK (subagent IN (0, 1)),
    cwd            TEXT,
    atc_session    TEXT,
    atc_name       TEXT,
    issue          TEXT,
    tool           TEXT,
    input          TEXT,
    reason         TEXT,
    scanned_at     TEXT NOT NULL
  );
  CREATE INDEX refusals_at ON refusals (at);`,

  `CREATE TABLE capacity_samples (
    at                 TEXT PRIMARY KEY,
    impd_budget_mib    INTEGER,
    impd_used_mib      INTEGER,
    impd_committed_mib INTEGER,
    nonnix_awake_mib   INTEGER,
    nix_awake_mib      INTEGER,
    cloud_avail_bytes  INTEGER,
    cloud_total_bytes  INTEGER,
    claude_account     TEXT,
    claude_five_hour   REAL,
    claude_seven_day   REAL,
    claude_at          TEXT,
    ci_minutes_today   INTEGER,
    pc_disk_free_bytes INTEGER,
    pc_mem_avail_bytes INTEGER,
    errors             TEXT NOT NULL DEFAULT '{}'
  );`,

  `CREATE TABLE noslop_rounds (
    id           INTEGER PRIMARY KEY,
    repo         TEXT NOT NULL,
    pr           INTEGER NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('review', 'check')),
    started_at   TEXT NOT NULL,
    ended_at     TEXT NOT NULL,
    ms           INTEGER NOT NULL,
    ok           INTEGER NOT NULL CHECK (ok IN (0, 1)),
    head         TEXT,
    base         TEXT,
    depth        TEXT,
    findings     TEXT NOT NULL DEFAULT '[]',
    failed_calls INTEGER NOT NULL DEFAULT 0,
    conclusion   TEXT,
    open         TEXT NOT NULL DEFAULT '[]',
    error        TEXT,
    sha          TEXT NOT NULL
  );
  CREATE INDEX noslop_rounds_pr ON noslop_rounds (repo, pr);`,

  `ALTER TABLE noslop_rounds ADD COLUMN full INTEGER CHECK (full IN (0, 1));`,

  `ALTER TABLE asks ADD COLUMN item TEXT;
  ALTER TABLE asks ADD COLUMN stu_view TEXT;
  ALTER TABLE unblocks ADD COLUMN item TEXT;
  ALTER TABLE unblocks ADD COLUMN title TEXT;
  ALTER TABLE unblocks ADD COLUMN due_at TEXT;`,

  `ALTER TABLE marks ADD COLUMN grant_name TEXT;
  CREATE UNIQUE INDEX marks_grant_name ON marks (grant_name) WHERE grant_name IS NOT NULL;
  CREATE TABLE grant_actions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    grant_name TEXT NOT NULL,
    target     TEXT NOT NULL,
    note       TEXT,
    actor      TEXT NOT NULL,
    at         TEXT NOT NULL
  );
  CREATE INDEX grant_actions_at ON grant_actions (at);`,

  // SQLite cannot change a CHECK in place, so the typed table is copied into a new one, every row and
  // id kept.
  `CREATE TABLE typed_v28 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    to_session  TEXT NOT NULL,
    to_id       TEXT,
    to_name     TEXT,
    text        TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('call', 'proposal', 'chat', 'console')),
    source_ref  TEXT NOT NULL,
    source_at   TEXT,
    typed_by    TEXT NOT NULL,
    at          TEXT NOT NULL
  );
  INSERT INTO typed_v28 (id, to_session, to_id, to_name, text, source_kind, source_ref, source_at, typed_by, at)
    SELECT id, to_session, to_id, to_name, text, source_kind, source_ref, source_at, typed_by, at FROM typed;
  DROP TABLE typed;
  ALTER TABLE typed_v28 RENAME TO typed;
  CREATE INDEX typed_to ON typed (to_id, id);`,

  `ALTER TABLE capacity_samples ADD COLUMN nonnix_awake_vcpus INTEGER;`,

  `ALTER TABLE noslop_rounds ADD COLUMN state_key TEXT;
  ALTER TABLE noslop_rounds ADD COLUMN title TEXT;`,

  `ALTER TABLE capacity_samples ADD COLUMN op_account_used INTEGER;
  ALTER TABLE capacity_samples ADD COLUMN op_account_limit INTEGER;
  ALTER TABLE capacity_samples ADD COLUMN op_refused INTEGER CHECK (op_refused IN (0, 1));`,

  `ALTER TABLE run_sessions ADD COLUMN ended_by TEXT CHECK (ended_by IN ('sweep'));`,

  `ALTER TABLE noslop_rounds ADD COLUMN special TEXT;
  ALTER TABLE noslop_rounds ADD COLUMN redesign TEXT;`,

  `ALTER TABLE noslop_rounds ADD COLUMN confirm INTEGER NOT NULL DEFAULT 0 CHECK (confirm IN (0, 1));`,

  `CREATE TABLE pr_status (
    repo          TEXT NOT NULL,
    pr            INTEGER NOT NULL,
    head          TEXT,
    gate          TEXT CHECK (gate IN ('pass', 'fail', 'none')),
    gate_head     TEXT,
    gate_at       TEXT,
    answer        TEXT CHECK (answer IN ('lgtm', 'changes', 'reject')),
    answer_head   TEXT,
    answer_source TEXT,
    answer_note   TEXT,
    answer_at     TEXT,
    next          TEXT,
    next_at       TEXT,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (repo, pr)
  );`,

  `CREATE TABLE shipped_cache (
    kind       TEXT NOT NULL CHECK (kind IN ('merged-day', 'issue', 'project')),
    key        TEXT NOT NULL,
    body       TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT,
    PRIMARY KEY (kind, key)
  );`,

  `ALTER TABLE unblocks ADD COLUMN done_when TEXT;`,

  // SQLite can't change a CHECK, so followups is rebuilt with every row kept.
  `CREATE TABLE linear_filed (
    issue      TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('owner', 'design', 'agent', 'live check', 'bot')),
    pr_ref     TEXT,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX linear_filed_created ON linear_filed (created_at);
  CREATE TABLE linear_started (
    issue      TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE followups_v38 (
    issue    TEXT PRIMARY KEY,
    from_ref TEXT,
    filed_at TEXT NOT NULL,
    source   TEXT NOT NULL CHECK (source IN ('final', 'linear backfill', 'review')),
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL
  );
  INSERT INTO followups_v38 (issue, from_ref, filed_at, source, added_by, added_at) SELECT issue, from_ref, filed_at, source, added_by, added_at FROM followups;
  DROP TABLE followups;
  ALTER TABLE followups_v38 RENAME TO followups;
  CREATE INDEX followups_filed ON followups (filed_at);`,

  `CREATE TABLE focus (
    id       INTEGER PRIMARY KEY CHECK (id = 1),
    terms    TEXT NOT NULL,
    reserves TEXT NOT NULL,
    set_at   TEXT NOT NULL,
    set_by   TEXT NOT NULL
  );`,

  `ALTER TABLE unblocks ADD COLUMN kind TEXT NOT NULL DEFAULT 'owner' CHECK (kind IN ('owner', 'watch'));
  ALTER TABLE unblocks ADD COLUMN deadline TEXT;
  ALTER TABLE unblocks ADD COLUMN overdue_told_at TEXT;`,

  `ALTER TABLE usage_samples ADD COLUMN five_hour_resets_at TEXT;
  ALTER TABLE usage_samples ADD COLUMN seven_day_resets_at TEXT;
  ALTER TABLE capacity_samples ADD COLUMN claude_five_hour_resets_at TEXT;
  ALTER TABLE capacity_samples ADD COLUMN claude_seven_day_resets_at TEXT;`,

  `CREATE TABLE slot_minutes (
    day     TEXT NOT NULL,
    cause   TEXT NOT NULL CHECK (cause IN ('delivery', 'triage', 'supply')),
    minutes REAL NOT NULL,
    PRIMARY KEY (day, cause)
  );`,

  `ALTER TABLE grant_actions ADD COLUMN voided_at TEXT;
  ALTER TABLE grant_actions ADD COLUMN voided_by TEXT;
  ALTER TABLE grant_actions ADD COLUMN void_reason TEXT;`,

  `CREATE TABLE slot_usage (
    at                  TEXT NOT NULL,
    slot                INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),
    status              TEXT NOT NULL,
    five_hour           REAL,
    five_hour_resets_at TEXT,
    seven_day           REAL,
    seven_day_resets_at TEXT,
    working_lanes       INTEGER NOT NULL,
    PRIMARY KEY (at, slot)
  );`,

  `ALTER TABLE noslop_rounds ADD COLUMN patch_id TEXT;
  ALTER TABLE noslop_rounds ADD COLUMN base_move INTEGER NOT NULL DEFAULT 0 CHECK (base_move IN (0, 1));`,

  `ALTER TABLE runs ADD COLUMN design_lane TEXT CHECK (design_lane IN ('agent', 'with-geoff'));
  ALTER TABLE run_prs ADD COLUMN design_pass INTEGER NOT NULL DEFAULT 0 CHECK (design_pass IN (0, 1));
  ALTER TABLE run_sessions ADD COLUMN design_pass INTEGER NOT NULL DEFAULT 0 CHECK (design_pass IN (0, 1));
  CREATE TABLE slot_minutes_v46 (
    day     TEXT NOT NULL,
    cause   TEXT NOT NULL CHECK (cause IN ('delivery', 'triage', 'supply', 'design')),
    minutes REAL NOT NULL,
    PRIMARY KEY (day, cause)
  );
  INSERT INTO slot_minutes_v46 (day, cause, minutes) SELECT day, cause, minutes FROM slot_minutes;
  DROP TABLE slot_minutes;
  ALTER TABLE slot_minutes_v46 RENAME TO slot_minutes;`,

  `CREATE TABLE umbrella_boxes (
    repo       TEXT NOT NULL,
    number     INTEGER NOT NULL,
    issue      TEXT NOT NULL,
    merged_at  TEXT NOT NULL,
    outcome    TEXT CHECK (outcome IN ('news', 'ticked', 'no_box', 'ambiguous', 'gone')),
    decided_at TEXT,
    PRIMARY KEY (repo, number, issue)
  );
  -- A merge up to 48 hours old still gets its box decided, but syncKinds never reads a cached day
  -- again. Today is never cached, so forgetting the two newest cached days makes the next sync read
  -- the rest of the window and record its boxes.
  DELETE FROM merged_pr_days WHERE day IN (SELECT day FROM merged_pr_days ORDER BY day DESC LIMIT 2);`,

  `CREATE TABLE linear_started_prs (
    issue     TEXT NOT NULL,
    ref       TEXT NOT NULL,
    status    TEXT NOT NULL,
    merged_at TEXT,
    PRIMARY KEY (issue, ref)
  );`,

  `ALTER TABLE run_prs ADD COLUMN session_id TEXT;
  ALTER TABLE run_prs ADD COLUMN session_by_hand INTEGER NOT NULL DEFAULT 0;`,

  `ALTER TABLE capacity_samples ADD COLUMN impd_priority_kept_mib INTEGER;`,
];
