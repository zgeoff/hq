const TAKEOVER_STALE_MS = 60_000;

// A takeover lasts milliseconds, so an old one is from a process that died inside it. One that ended
// before its start time was read (null) is not old: a new takeover may already hold its name.
export function isStaleTakeover(startedMs: number | null, nowMs: number): boolean {
  return startedMs !== null && nowMs - startedMs > TAKEOVER_STALE_MS;
}
