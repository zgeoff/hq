import { readAtcSessions } from '../atc/read-atc-sessions.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { DEFS } from '../prompts/defs.ts';
import { getProjectsDir } from '../repair/get-projects-dir.ts';
import { ROLES } from '../roles/roles.ts';
import { buildReferenceCounts } from './build-reference-counts.ts';
import { buildRoleSkills } from './build-role-skills.ts';
import { readReferenceOpens } from './read-reference-opens.ts';
import { readSkillReferences } from './read-skill-references.ts';
import type { SessionInfo } from '../atc/session-schema.ts';
import type { ReferenceCount, ReferenceOptions } from './types.ts';

// hq refs: each role's skill references and how many of the role's sessions opened each in the
// last `days` days. A transcript maps to a role through atc's list (Claude session id -> atc name):
// a session atc no longer lists, or one restarted since, counts for no role. atc down throws.
export async function readReferenceCounts(options: ReferenceOptions): Promise<ReferenceCount[]> {
  const until = now();
  const since = new Date(until.getTime() - options.days * 86_400_000);
  const roles = buildRoleSkills(ROLES);
  // oxlint-disable-next-line new-cap -- DEFS is the definitions folder's accessor, called as every module calls it
  const definitionsDirectory = DEFS();
  const skills = [...new Set(roles.flatMap((role) => role.skills))];
  const references = new Map(skills.map((skill) => [skill, readSkillReferences(definitionsDirectory, skill)]));
  const sessions = await readRoleSessions(options.sessions ?? readAtcSessions);
  const names = new Map<string, string>();
  for (const session of sessions) {
    if (session.agentSessionID) {
      names.set(session.agentSessionID, session.name);
    }
  }
  const opens = await readReferenceOpens(getProjectsDir(), since, until);
  return buildReferenceCounts(roles, references, opens, names);
}

async function readRoleSessions(get: () => Promise<SessionInfo[]>): Promise<SessionInfo[]> {
  try {
    return await get();
  } catch (error) {
    if (error instanceof HqError) {
      throw error;
    }
    throw new HqError('atc_unreachable', `hq refs needs atc's session list to give each transcript its role: ${String(error)}`);
  }
}
