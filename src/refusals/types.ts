import type { SessionInfo } from '../atc/session-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import type { BY } from './by.ts';

export interface ScanOptions {
  dir?: string;
  windowDays?: number;
  budgetBytes?: number;
  maxLineBytes?: number;
  sliceBytes?: number;
  deadlineMs?: number;
  sessions?: () => Promise<SessionInfo[]>;
}

export interface ScanResult {
  files_read: number;
  bytes_read: number;
  refusals_added: number;
  files_left: number;
}

export interface Who {
  id: string;
  name: string;
}

export interface Found {
  uuid: string;
  at: string;
  claude_session: string | null;
  cwd: string | null;
  tool: string | null;
  input: string | null;
  reason: string | null;
}

// oxlint-disable-next-line typescript/no-explicit-any -- a transcript record is untyped JSON read field by field
export type Obj = Record<string, any>;

export interface Tool {
  name: string;
  input: string | null;
}

export type RefusalRow = Omit<HqTables['refusals'], 'scanned_at'>;

export type By = (typeof BY)[number];
