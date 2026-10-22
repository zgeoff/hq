import { existsSync, readFileSync } from 'node:fs';
import { getLogFiles } from './get-log-files.ts';
import { logEvents } from './log-events.ts';

export function readLog(): { events: { kind: 'DEPLOY' | 'HOLD'; at: string }[]; from: string | null } {
  const texts = getLogFiles().filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8'));
  const events = logEvents(texts);
  const from = events.length ? events.reduce((a, e) => (e.at < a ? e.at : a), events[0]!.at) : null;
  return { events, from };
}
