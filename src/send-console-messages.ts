import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { flush } from './outbox/flush.ts';
import { takeQueued } from './outbox/take-queued.ts';

export async function sendConsoleMessages(db: Database): Promise<boolean> {
  const result = await flush(db, { ids: takeQueued() });
  for (const error of result.errors) {
    console.log(`${iso(now())} console: the message to the owner session failed: ${error}`);
  }
  return result.failed === 0;
}
