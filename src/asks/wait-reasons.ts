import type { Database } from 'bun:sqlite';
import { isQuiet } from '../clock/is-quiet.ts';
import { now } from '../clock/now.ts';
import { currentHold } from './current-hold.ts';
import { openItem } from './open-item.ts';

// Why the next item cannot open right now, or [] when it can.
export function waitReasons(db: Database): string[] {
  const reasons: string[] = [];
  const open = openItem(db);
  if (open) reasons.push(`open: ${open.id}`);
  if (isQuiet(now())) reasons.push('quiet hours (03:00-07:00 Sydney)');
  const hold = currentHold(db);
  if (hold) reasons.push(`held: ${hold.reason}`);
  return reasons;
}
