import type { Role } from './role-names.ts';

export type SingleRole = 'owner' | 'orchestrator' | 'reviewer' | 'qa';

export interface DeclaredSession {
  name: string;

  // skill slugs in the definitions repo, the role skill first; empty for a session with a prompt file of its own
  skills: readonly string[];
  cwd: 'defs' | 'hq';
  model: string;
  wake: boolean;
  remoteControl?: boolean;

  // Claude Code plugin folders this session alone loads, passed to atc's spawn
  pluginDirs?: string[];

  // for a session with no skills: a file under ~/.local/share/z-sessions, or main:<path> in hq-private
  prompt?: string;
  note?: string;
  roles: Role[];
}

export interface RolesTable {
  sessions: DeclaredSession[];
  forwards: Record<string, string>;
}
