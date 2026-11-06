export interface PartWrapEvent {
  action: string;
  atMs: number;
  session: string;
}

// A finished wrap-up writes a done event after its claim. A claim older than the bound with no done
// event belongs to a sweep that died part-way, so its session counts as free again.
export function collectWrappedPartSessions(events: readonly PartWrapEvent[], nowMs: number, abandonedMs: number): Set<string> {
  return new Set(events.filter((event) => event.action === 'part-wrap-up-done' || (event.action === 'part-wrap-up' && nowMs - event.atMs < abandonedMs)).map((event) => event.session));
}
