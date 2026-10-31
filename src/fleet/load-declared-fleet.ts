import { DEFS } from '../prompts/defs.ts';
import { rolePrompt } from '../prompts/role-prompt.ts';
import { getDeclaredSessions as declaredSessions } from '../roles/get-declared-sessions.ts';
import { findRoleSkill } from '../roles/find-role-skill.ts';
import type { DeclaredSession } from '../roles/types.ts';
import { getHome as HOME, getHome } from './get-home.ts';
import type { FleetEntry } from './types.ts';

// The declared sessions, built from the roles table (fleet.json).
export function loadDeclaredFleet(): FleetEntry[] {
  return declaredSessions().map((s) => buildFleetEntry(s));
}

function getPromptSource(session: DeclaredSession): string {
  const roleSkill = findRoleSkill(session);
  if (roleSkill !== null) {
    return rolePrompt(roleSkill);
  }
  if (session.prompt?.startsWith('main:')) {
    return session.prompt;
  }
  return `${getHome()}/.local/share/z-sessions/${session.prompt}`;
}

function buildFleetEntry(s: DeclaredSession): FleetEntry {
  const entry: FleetEntry = {
    name: s.name,
    cwd: s.cwd === 'defs' ? DEFS() : `${HOME()}/projects/hq`,
    model: s.model,
    prompt: getPromptSource(s),
    wake: s.wake,
    skills: s.skills,

    // the alias goes in the next release; read `skills`
    skill: findRoleSkill(s),
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
