import { existsSync, readFileSync } from 'node:fs';
import { readLogFiles } from './read-log-files.ts';
import { logEvents } from './log-events.ts';

export function readLog(directory: string): { events: { kind: 'DEPLOY' | 'HOLD'; at: string }[]; from: string | null } {
  const texts = existsSync(directory) ? readLogFiles(directory).filter((file) => existsSync(file)).map((file) => readFileSync(file, 'utf8')) : [];
  const events = logEvents(texts);
  const from = events.length ? events.reduce((a, e) => (e.at < a ? e.at : a), events[0]!.at) : null;
  return { events, from };
}
