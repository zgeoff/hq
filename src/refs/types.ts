import type { SessionInfo } from '../atc/session-schema.ts';
import type { Role } from '../roles/role-names.ts';

export interface ReferenceCount {
  role: Role;
  reference: string;
  count: number;
}

export interface RoleSkills {
  role: Role;
  names: string[];
  skills: string[];
}

export interface ReferenceOptions {
  days: number;
  sessions?: () => Promise<SessionInfo[]>;
}

export interface ChunkCarry {
  parts: Buffer[];
  length: number;
  skipping: boolean;
}
