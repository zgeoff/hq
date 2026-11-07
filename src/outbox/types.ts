import type { HqTables } from '../db/hq-columns.ts';

export type OutboxRow = HqTables['outbox'];

export interface FlushResult {
  sent: number;
  failed: number;
  dropped: number;
  skipped: boolean;
  errors: string[];
}

export interface DetachResult {
  unit: string | null;
  error: string | null;
}
