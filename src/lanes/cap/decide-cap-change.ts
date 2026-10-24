import { roleName } from '../../roles/role-name.ts';
import type { CapAction } from './cap-transitions.ts';
import type { LanesCap } from './lanes-cap.ts';
import type { CapCaller } from './read-cap-caller.ts';

// A change already checked against the clock: the until is an ISO time.
export type CapRequest = { kind: 'off'; reason: string | null } | { kind: 'set'; cap: number; until: string | null; reason: string | null };

export interface CapChangeInput {
  caller: CapCaller;
  current: LanesCap | null;
  request: CapRequest;
  at: string;
}

export type CapDecision = { ok: true; action: CapAction; cap: LanesCap; reason: string | null; by: string } | { ok: true; action: null } | { ok: false; message: string };

// Who may change the cap: the owner's session any way; the delivery lead's only to set one where
// none exists or to lower it, keeping the until and reason it does not replace.
export function decideCapChange(input: CapChangeInput): CapDecision {
  const owner = roleName('owner');
  const delivery = roleName('orchestrator');
  const caller = input.caller;
  if (caller.kind === 'unknown') {
    return { ok: false, message: `atc could not say who is asking, so the lanes cap stays as it is: ${caller.cause}` };
  }
  if (caller.kind === 'other') {
    return { ok: false, message: `only ${owner} may change the lanes cap, and ${delivery} may set one or lower it; atc does not know this caller as either` };
  }
  const request = input.request;
  if (request.kind === 'off') {
    if (caller.kind === 'delivery') {
      return { ok: false, message: `${delivery} may set a lanes cap or lower it, not lift it; ${owner} may` };
    }
    return input.current === null ? { ok: true, action: null } : { ok: true, action: 'cap-off', cap: input.current, reason: request.reason, by: caller.by };
  }
  if (caller.kind === 'delivery' && input.current !== null && request.cap >= input.current.cap) {
    return { ok: false, message: `${delivery} may only lower the lanes cap (now ${input.current.cap}), not raise or keep it; ${owner} may` };
  }
  const keep = caller.kind === 'delivery' ? input.current : null;
  const until = request.until ?? keep?.until ?? null;
  const reason = request.reason ?? keep?.reason ?? null;
  return { ok: true, action: 'cap-set', cap: { cap: request.cap, until, reason, by: caller.by, at: input.at }, reason, by: caller.by };
}
