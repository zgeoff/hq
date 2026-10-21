import type { SessionInfo } from '../atc/session-schema.ts';
import type { BY } from './by.ts';

export interface ScanOptions {
  dir?: string;
  windowDays?: number; // first sight of a file older than this skips its history
  budgetBytes?: number; // every byte read is charged; checked between lines
  maxLineBytes?: number; // a longer line is passed over
  sliceBytes?: number; // bytes per read (tests)
  deadlineMs?: number; // stop reading after this long; what is left resumes next scan
  sessions?: () => Promise<SessionInfo[]>; // atc's list; a failure scans with no session names
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
  input: string | null; // inputOf's output: already cut and masked; raw input is never kept
}

export interface RefusalRow {
  uuid: string;
  at: string;
  claude_session: string | null;
  transcript: string;
  subagent: number;
  cwd: string | null;
  atc_session: string | null;
  atc_name: string | null;
  issue: string | null;
  tool: string | null;
  input: string | null;
  reason: string | null;
}

export type By = (typeof BY)[number];
