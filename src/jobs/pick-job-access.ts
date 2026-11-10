export type JobCaller = { kind: 'named'; name: string } | { kind: 'unnamed' } | { kind: 'unknown'; cause: string };

export type JobAccess = { allowed: true } | { allowed: false; reason: string };

export interface JobAccessRequest {
  caller: JobCaller;
  target: string;
  owner: string;
}

// Only the target itself or the owner's session may change a role's jobs.
export function pickJobAccess(request: JobAccessRequest): JobAccess {
  const caller = request.caller;
  const rule = `only ${request.target} itself or ${request.owner} may add or remove its jobs`;
  if (caller.kind === 'unknown') {
    return { allowed: false, reason: `hq could not tell which session is asking (${caller.cause}); ${rule}` };
  }
  if (caller.kind === 'unnamed') {
    return { allowed: false, reason: `hq found no fleet session behind this caller; ${rule}` };
  }
  if (caller.name === request.target || caller.name === request.owner) {
    return { allowed: true };
  }
  return { allowed: false, reason: `${caller.name} may not change the jobs of ${request.target}: ${rule}` };
}
