export const ROLE_NAMES = ['owner', 'orchestrator', 'reviewer', 'qa', 'triage', 'steward', 'developer'] as const;
export type Role = (typeof ROLE_NAMES)[number];
