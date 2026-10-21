import type { Role } from './role-names.ts';

export type SingleRole = 'owner' | 'orchestrator' | 'reviewer' | 'qa';

export interface DeclaredSession {
  name: string;
  skill: string | null; // a skill slug in the definitions repo; null for a session with a prompt file of its own
  cwd: 'defs' | 'hq';
  model: string;
  wake: boolean;
  remoteControl?: boolean;

  // Claude Code plugin folders this session alone loads, passed to atc's spawn
  pluginDirs?: string[];
  prompt?: string; // a file under ~/.local/share/z-sessions, for a session with no skill
  note?: string;
  roles: Role[];
}

export interface RolesTable {
  sessions: DeclaredSession[];
  forwards: Record<string, string>;
}
