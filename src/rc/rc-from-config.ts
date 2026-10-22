import { bootTime } from './boot-time.ts';
import { pidAlive } from './pid-alive.ts';
import { procStart } from './proc-start.ts';
import { RC_CAP } from './rc-cap.ts';
import type { PidFind, RcState } from './types.ts';

const DAY_MS = 86_400_000;

// The pure part: the config file's text (null when it could not be read), the session's pid, and
// the live process's start time (field 22 of /proc/<pid>/stat; null when unreadable).
// 'off' needs proof that records are being written (z-stu, option A): the list exists, holds fewer
// than RC_CAP records, none for this process, and another process wrote one in the last day.
export function rcFromConfig(text: string | null, found: PidFind, alive: (pid: number) => boolean = pidAlive, start: (pid: number) => string | null = procStart, at: number = Date.now(), boot: number | null = bootTime()): RcState {
  if ('why' in found) return { state: 'unknown', why: found.why };
  // Both answers need the live process: alive, with a start time to compare.
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: 'unknown', why: 'the Claude Code config file has an unexpected shape' };

  // From here raw is the config's bridge record list.
  raw = (raw as Record<string, unknown>)['replBridgePlaceholders'];
  if (raw === undefined) {
    return { state: 'unknown', why: 'the config has no bridge record list, so no proof that records are written' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { state: 'unknown', why: 'replBridgePlaceholders has an unexpected shape' };
  }
  const entries: { pid: number; createdAt: number | null; procStart: string | null }[] = [];
  for (const e of Object.values(raw as Record<string, unknown>)) {
    const r = e && typeof e === 'object' ? (e as { pid?: unknown; createdAt?: unknown; procStart?: unknown }) : {};
    if (typeof r.pid !== 'number' || !Number.isInteger(r.pid)) return { state: 'unknown', why: 'a bridge entry has no process id' };
    entries.push({ pid: r.pid, createdAt: typeof r.createdAt === 'number' ? r.createdAt : null, procStart: typeof r.procStart === 'string' ? r.procStart : null });
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
