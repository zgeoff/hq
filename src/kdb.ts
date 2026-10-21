// Kysely, first stage (Decision 23): a typed query builder over hq's own bun:sqlite Database.
// Migrations stay raw SQL in db.ts; new code reads and writes through here.
import type { Database } from 'bun:sqlite';
import { Kysely, SqliteDialect } from 'kysely';
import type { SqliteDatabase } from 'kysely';

export interface CapacitySampleRow {
  at: string;
  impd_budget_mib: number | null;
  impd_used_mib: number | null;
  impd_committed_mib: number | null;
  nonnix_awake_mib: number | null;
  nonnix_awake_vcpus: number | null;
  nix_awake_mib: number | null;
  cloud_avail_bytes: number | null;
  cloud_total_bytes: number | null;
  claude_account: string | null;
  claude_five_hour: number | null;
  claude_seven_day: number | null;
  claude_at: string | null;
  ci_minutes_today: number | null;
  pc_disk_free_bytes: number | null;
  pc_mem_avail_bytes: number | null;
  op_account_used: number | null;
  op_account_limit: number | null;
  op_refused: number | null;
  errors: string; // JSON {source: message}
}

export interface PRStatusRow {
  repo: string;
  pr: number;
  head: string | null;
  gate: 'pass' | 'fail' | 'none' | null;
  gate_head: string | null;
  gate_at: string | null;
  answer: 'lgtm' | 'changes' | 'reject' | null;
  answer_head: string | null;
  answer_source: string | null;
  answer_note: string | null;
  answer_at: string | null;
  next: string | null;
  next_at: string | null;
  updated_at: string;
}

export interface ShippedCacheRow {
  kind: 'merged-day' | 'issue' | 'project';
  key: string;
  body: string;
  fetched_at: string;
  expires_at: string | null;
}

export interface HqTables {
  capacity_samples: CapacitySampleRow;
  pr_status: PRStatusRow;
  shipped_cache: ShippedCacheRow;
}

// hq owns the Database, so close() does nothing. bun:sqlite statements take their parameters
// spread; Kysely passes an array. A statement that returns columns is a reader.
function adapter(db: Database): SqliteDatabase {
  return {
    close() {},
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        reader: stmt.columnNames.length > 0,
        all: (p) => stmt.all(...(p as never[])),
        run: (p) => stmt.run(...(p as never[])),
        iterate: (p) => stmt.iterate(...(p as never[])) as IterableIterator<unknown>,
      };
    },
  };
}

export function kdb(db: Database): Kysely<HqTables> {
  return new Kysely<HqTables>({ dialect: new SqliteDialect({ database: adapter(db) }) });
}
