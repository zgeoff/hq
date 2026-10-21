import type { FleetSession } from './types.ts';

// The live session a declared name stands for: the recorded id when alive, else the one live
// session of that name. Null when there is none, or several share the name.
export function findLiveSession(name: string, live: FleetSession[], known: Record<string, string>): FleetSession | null {
  const byName = live.filter((s) => s.alive && s.name === name),
    recorded = Object.hasOwn(known, name) ? live.find((s) => s.id === known[name] && s.alive) : undefined;
  if (recorded) {
    return recorded;
  }
  return byName.length === 1 ? (byName[0] ?? null) : null;
}
