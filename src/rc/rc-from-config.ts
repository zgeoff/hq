import { bootTime } from './boot-time.ts';
import { pidAlive } from './pid-alive.ts';
import { procStart } from './proc-start.ts';
import { RC_CAP } from './rc-cap.ts';
import type { PidFind, RcState } from './types.ts';
import { isRecord } from '@zgeoff/std';

const DAY_MS = 86_400_000;

export function rcFromConfig(text: string | null, found: PidFind, alive: (pid: number) => boolean = pidAlive, start: (pid: number) => string | null = procStart, at: number = Date.now(), boot: number | null = bootTime()): RcState {
  if ('why' in found) return { state: 'unknown', why: found.why };
  if (!alive(found.pid)) return { state: 'unknown', why: `process ${found.pid} is not alive` };
  const live = start(found.pid);
  if (live === null) return { state: 'unknown', why: `process ${found.pid}'s start time can't be read` };
  if (text === null) return { state: 'unknown', why: "the Claude Code config file can't be read" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: 'unknown', why: "the Claude Code config file isn't valid JSON" };
  }
  if (!isRecord(raw)) {
    return { state: 'unknown', why: 'the Claude Code config file has an unexpected shape' };
  }

  const placeholders = raw['replBridgePlaceholders'];
  if (placeholders === undefined) {
    return { state: 'unknown', why: 'the config has no bridge record list, so no proof that records are written' };
  }
  if (!isRecord(placeholders)) {
    return { state: 'unknown', why: 'replBridgePlaceholders has an unexpected shape' };
  }
  const entries: { pid: number; createdAt: number | null; procStart: string | null }[] = [];
  for (const entry of Object.values(placeholders)) {
    const record: Record<string, unknown> = isRecord(entry) ? entry : {};
    const entryPID = record['pid'];
    const entryCreatedAt = record['createdAt'];
    const entryProcStart = record['procStart'];
    if (typeof entryPID !== 'number' || !Number.isInteger(entryPID)) {
      return { state: 'unknown', why: 'a bridge entry has no process id' };
    }
    entries.push({ pid: entryPID, createdAt: typeof entryCreatedAt === 'number' ? entryCreatedAt : null, procStart: typeof entryProcStart === 'string' ? entryProcStart : null });
  }
  const mine = entries.filter((e) => e.pid === found.pid);
  if (mine.length) {
    // A reused pid: the record is an older process's, so it proves nothing about this one. A start
    // time counts from boot, so a record from before the last boot proves nothing either.
    if (boot === null || mine.some((e) => e.createdAt === null || e.createdAt < boot)) return { state: 'unknown', why: `process ${found.pid}'s bridge record may be from before the last boot` };
    if (mine.some((e) => e.procStart === null || e.procStart !== live)) return { state: 'unknown', why: `process ${found.pid}'s bridge record may belong to an earlier process with the same id` };
    return { state: 'on', why: `process ${found.pid} has a bridge` };
  }
  if (entries.length >= RC_CAP) return { state: 'unknown', why: `the bridge record list is full (${RC_CAP}), so this process's record could have been evicted` };
  if (!entries.some((e) => e.createdAt !== null && at - e.createdAt >= 0 && at - e.createdAt <= DAY_MS)) return { state: 'unknown', why: 'no bridge record was written in the last day, so no proof that records are written now' };
  return { state: 'off', why: `no bridge record for process ${found.pid}, and other processes' records are written` };
}
