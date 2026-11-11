import type { Role } from './role-names.ts';

export type SingleRole = 'owner' | 'orchestrator' | 'reviewer' | 'qa';

export interface DeclaredSession {
  name: string;

  skills: readonly string[];
  cwd: 'defs' | 'hq';

  // The session's own model; absent means the fleet model (hq model).
  model?: string;
  wake: boolean;
  remoteControl?: boolean;

  pluginDirs?: string[];

  prompt?: string;
  note?: string;
  roles: Role[];
}

export interface RolesTable {
  sessions: DeclaredSession[];
  forwards: Record<string, string>;
}
