import { collectLogFiles } from './collect-log-files.ts';
import { logEvents } from './log-events.ts';
import type { LogFiles } from './types.ts';

export function readLog(directory: string, files: LogFiles): { events: { kind: 'DEPLOY' | 'HOLD'; at: string }[]; from: string | null } {
  const paths = files.probeExists(directory) ? collectLogFiles(directory, files.listNames(directory)) : [];
  const texts = paths.filter((path) => files.probeExists(path)).map((path) => files.readText(path));
  const events = logEvents(texts);
  const from = events.length ? events.reduce((a, e) => (e.at < a ? e.at : a), events[0]!.at) : null;
  return { events, from };
}
