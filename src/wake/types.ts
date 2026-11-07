import type { z } from 'zod';
import type { RestartRecordSchema } from './restart-record-schema.ts';

export type RestartRecord = z.output<typeof RestartRecordSchema>;

export interface WakeEntry {
  session_id: string;
  name: string;
  note: string | null;
  added_by: string;
  added_at: string;
}

export type WakeReason = 'orchestrator' | 'interrupted' | 'background';

interface WakeMessage {
  session: string;
  name: string;
  reason: WakeReason;
  text: string;
  idempotencyKey: string;
}

export interface WakePlan {
  runID: string;
  messages: WakeMessage[];
  skipped: { session: string; name: string; why: string }[];
}

export interface WakeResult {
  runID: string;
  sent: { session: string; name: string; reason: WakeReason; message?: string; error?: string }[];
  skipped: WakePlan['skipped'];
  dryRun: boolean;
}
