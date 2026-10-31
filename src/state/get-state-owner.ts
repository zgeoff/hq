// The session that keeps a role's state file: z-<role> keeps <role>.md (see getStateRoles).
export function getStateOwner(role: string): string {
  return `z-${role}`;
}
