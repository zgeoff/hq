import type { SessionInfo } from '../atc/session-schema.ts';
import type { z } from 'zod';
import type { BY } from './by.ts';
import type { RefusalRowSchema } from './refusal-row-schema.ts';

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

export type Obj = Record<string, unknown>;

export interface Tool {
  name: string;
  input: string | null;
}

export type RefusalRow = z.output<typeof RefusalRowSchema>;

export type By = (typeof BY)[number];
