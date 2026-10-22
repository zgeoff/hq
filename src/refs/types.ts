import type { SessionInfo } from '../atc/session-schema.ts';
import type { Role } from '../roles/role-names.ts';

// `reference` is `<skill>/references/<file>`; `count` is the distinct sessions of the role that
// opened it in the window.
export interface ReferenceCount {
  role: Role;
  reference: string;
  count: number;
}

// `names` are the atc session names that hold the role, forwarded names included.
export interface RoleSkills {
  role: Role;
  names: string[];
  skills: string[];
}

// `sessions` is atc's list; tests pass their own. A failure fails the read.
export interface ReferenceOptions {
  days: number;
  sessions?: () => Promise<SessionInfo[]>;
}
