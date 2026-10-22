import { resolve } from 'node:path';
import { getHome } from './get-home.ts';
import type { FleetEntry, FleetSession, PluginDrift } from './types.ts';

// atc restarts a session with the folders it was spawned with, so only a respawn changes them.
// A session atc lists without pluginDirs loads none: atc before 4.15 spawned none. atc lists a
// ~/ folder expanded, so both sides are compared expanded and resolved. Only `hq fleet` reads this;
// ensure never respawns on it.
export function findPluginDrift(entries: FleetEntry[], live: FleetSession[], known: Record<string, string> = {}): Record<string, PluginDrift> {
  const out: Record<string, PluginDrift> = {};
  for (const e of entries) {
    const session = findLiveSession(e.name, live, known);
    if (session) {
      const declared = e.pluginDirs ?? [],
        running = [...(session.pluginDirs ?? [])];
      if (declared.map((d) => expandHome(d)).join('\n') !== running.map((d) => expandHome(d)).join('\n')) {
        out[e.name] = { declared, running };
      }
    }
  }
  return out;
}

// The recorded id when it is alive, else the one live session of the name; none when two share it.
function findLiveSession(name: string, live: FleetSession[], known: Record<string, string>): FleetSession | undefined {
  const byName = live.filter((s) => s.alive && s.name === name),
    recorded = Object.hasOwn(known, name) ? live.find((s) => s.id === known[name] && s.alive) : undefined;
  return recorded ?? (byName.length === 1 ? byName[0] : undefined);
}

function expandHome(dir: string): string {
  const expanded = dir.startsWith('~/') ? `${getHome()}/${dir.slice(2)}` : dir;
  return resolve(expanded);
}
