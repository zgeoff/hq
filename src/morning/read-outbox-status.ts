import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const statusRow = z.object({ status: z.string() }).nullable();

// A job's message is found by its event, not by its stored key: a forward re-keys the outbox row to
// the forwarded session. A failed row wins when the event has more than one.
export function readOutboxStatus(db: Database, outboxKey: string | null): string | null {
  const seq = Number(/^hq-ev(?<seq>\d+)-/u.exec(outboxKey ?? '')?.groups?.['seq']);
  if (Number.isNaN(seq)) {
    return null;
  }
  const row = statusRow.parse(db.query(`SELECT status FROM outbox WHERE event_seq = ? ORDER BY status = 'failed' DESC LIMIT 1`).get(seq));
  return row?.status ?? null;
}
