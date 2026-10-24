import { z } from 'zod';

// An integer of milliseconds or minutes. 0 is allowed: a test sets a wait to 0, and a threshold of 0 means "at once".
const count = (dflt: number) => z.coerce.number().int().nonnegative().default(dflt);
// A wait that falls back to its default when the value is unusable (not a number, negative); the
// caller clamps the top end. A bad value here has never been an error.
const lenientWait = (dflt: number) => z.coerce.number().nonnegative().finite().catch(dflt).default(dflt);
const text = () => z.string().optional();

export const CONFIG_SHAPE = {
  // Minutes and milliseconds.
  HQ_REVIEW_LOCK_WAIT_MS: count(300_000),
  HQ_LANES_FREE_MIN: count(10),
  HQ_LANES_REPEAT_MIN: count(30),
  HQ_LANES_FOLLOW_MIN: count(10),
  HQ_LANES_READY_FRESH_MIN: count(30),
  HQ_LANES_READY_ZERO_FRESH_MIN: count(180),
  HQ_LANES_READY_STALE_MIN: count(120),
  HQ_RUN_FINAL_MIN: count(30),
  HQ_RUN_REVIEW_MIN: count(60),
  HQ_RUN_QUIET_MIN: count(60),
  HQ_RUN_REPEAT_MIN: count(30),
  HQ_SEARCH_GAP_MS: count(2_100),
  HQ_REF_LOCK_RETRY_MS: count(3_000),
  HQ_SYNC_GIT_TIMEOUT_MS: count(40_000),
  HQ_FETCH_RETRY_MS: count(10_000),
  HQ_RC_POLL_MS: lenientWait(15_000),
  HQ_SEND_WAIT_MS: lenientWait(15_000),
  HQ_RESTORE_WAIT_MS: lenientWait(180_000),
  // Quiet hours, "03-07": start and end hour in Sydney.
  HQ_QUIET: z
    .string()
    .regex(/^\d{1,2}-\d{1,2}$/)
    .default('03-07'),
  HQ_STATS_CUTOFF: z.string().default('2026-10-14T20:00:00Z'),
  // Anything but "off" leaves notifications on; anything but "1" is not a live run.
  HQ_NOTIFY: text(),
  HQ_LIVE: text(),
  // Paths and names. Each default is built where it is used.
  REVIEW_DIR: path(),
  HQ_REPOS: path(),
  HQ_PROJECTS: path(),
  HQ_NOSLOP_OP_SETTINGS: path(),
  HQ_SLOTS_OP_SETTINGS: path(),
  HQ_NOSLOP_STORE: path(),
  HQ_CAPACITY: path(),
  HQ_BACKUP_DIR: path(),
  HQ_BACKUP_PASSWORD_FILE: path(),
  HQ_BACKUP_REMOTE_ENV: path(),
  HQ_BACKUP_DB: path(),
  HQ_BACKUP_DIRS: paths(),
  HQ_DB: path(),
  HQ_LIVECHECK_TO: text(),
  HQ_CLAUDE_JSON: path(),
  HQ_ATC_SOCKET: path(),
  HQ_ATC_STATE: path(),
  HQ_REPAIR_BACKUPS: path(),
  HQ_CLAUDE_PROJECTS: path(),
  HQ_AS: text(),
  HQ_DEFINITIONS_DIR: path(),
  HQ_PRIVATE_DIR: path(),
  HQ_DEFS_SOURCE_FILE: path(),
  HQ_NOW: text(),
  HQ_ORCHESTRATOR: text(),
  HQ_OWNER: text(),
  HQ_LOCAL_CONFIG: path(),
  HQ_NOSLOP_OP_VAULT: text(),
  HQ_NOSLOP_OP_ITEM: text(),
  HQ_LINEAR_OP_REF: text(),
  HQ_PROBE_TARGET: text(),
  HQ_PROBE_READY: text(),
  HQ_CLOUD_METRICS_URL: text(),
  HQ_CLOUD_HOST: text(),
  HQ_PROBE_CONTROL: text(),
  HQ_RESTART_LOG: path(),
};

// A setting that names a file or directory, or a colon-separated list of them.
function path() {
  return text().describe('path');
}

function paths() {
  return text().describe('paths');
}
