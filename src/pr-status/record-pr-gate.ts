import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import type { PRGate, PRKey } from './types.ts';
import { upsertPRStatus } from './upsert-pr-status.ts';

// A checked gate has the head its check read; 'none' read no head.
export type PRGateResult = { gate: Exclude<PRGate, 'none'>; head: string } | { gate: 'none'; head: null };

// Stores the noslop gate's result for the head it ran at, and logs the write. 'none' leaves the
// record's last seen head as it was.
export async function recordPRGate(db: Database, key: PRKey, result: PRGateResult, actor: string): Promise<void> {
  const at = iso(now()),
    fields = result.head === null ? { gate: result.gate, gate_head: null, gate_at: at } : { head: result.head, gate: result.gate, gate_head: result.head, gate_at: at };
  upsertPRStatus(db, key.repo, key.pr, fields);
  logEvent(db, 'hq', `pr:${key.repo}#${key.pr}`, 'pr-gate', actor, null, null, { gate: result.gate, head: result.head });
}
