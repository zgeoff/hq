import { DEFS } from '../prompts/defs.ts';
import { rolePrompt } from '../prompts/role-prompt.ts';
import { getDeclaredSessions as declaredSessions } from '../roles/get-declared-sessions.ts';
import type { DeclaredSession } from '../roles/types.ts';
import { getHome as HOME } from './get-home.ts';
import type { FleetEntry } from './types.ts';

// The declared sessions, built from the roles table (fleet.json).
export function loadDeclaredFleet(): FleetEntry[] {
  return declaredSessions().map((s) => buildFleetEntry(s));
}

function buildFleetEntry(s: DeclaredSession): FleetEntry {
  const entry: FleetEntry = {
    name: s.name,
    cwd: s.cwd === 'defs' ? DEFS() : `${HOME()}/projects/hq`,
    model: s.model,
    prompt: s.skill !== null ? rolePrompt(s.skill) : `${HOME()}/.local/share/z-sessions/${s.prompt}`,
    wake: s.wake,
    skill: s.skill,
    roles: s.roles,
  };
  if (s.remoteControl) {
    entry.remoteControl = true;
  }
  if (s.pluginDirs) {
    entry.pluginDirs = s.pluginDirs;
  }
  return entry;
}
