import type { FleetSession } from './types.ts';

export function findLiveSession(name: string, live: FleetSession[], known: Record<string, string>): FleetSession | null {
  const byName = live.filter((s) => s.alive && s.name === name),
    recorded = Object.hasOwn(known, name) ? live.find((s) => s.id === known[name] && s.alive) : undefined;
  if (recorded) {
    return recorded;
  }
  return byName.length === 1 ? (byName[0] ?? null) : null;
}
