// Bytes a role's state file may hold: docs/sessions.md sets 16 KB for every role and 15 KB for delivery.
const DEFAULT_LIMIT_BYTES = 16 * 1024;
const LIMIT_BYTES_BY_ROLE: Record<string, number> = {
  delivery: 15 * 1024,
};

export function getStateLimit(role: string): number {
  return LIMIT_BYTES_BY_ROLE[role] ?? DEFAULT_LIMIT_BYTES;
}
