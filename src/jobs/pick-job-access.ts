export type JobCaller = { kind: 'named'; name: string } | { kind: 'unnamed' } | { kind: 'unknown'; cause: string };

export type JobAccess = { allowed: true } | { allowed: false; reason: string };

export interface JobAccessRequest {
  caller: JobCaller;
  target: string;
  owner: string;
}

// Only the target itself or the owner's session may change a role's jobs.
export function pickJobAccess(request: JobAccessRequest): JobAccess {
  const { caller, target, owner } = request;
  const rule = `only ${target} itself or ${owner} may add or remove its jobs`;
  if (caller.kind === 'unknown') {
    return { allowed: false, reason: `hq could not tell which session is asking (${caller.cause}); ${rule}` };
  }
  if (caller.kind === 'unnamed') {
    return { allowed: false, reason: `hq found no fleet session behind this caller; ${rule}` };
  }
  if (caller.name === target || caller.name === owner) {
    return { allowed: true };
  }
  return { allowed: false, reason: `${caller.name} may not change the jobs of ${target}: ${rule}` };
}
