import { roleName } from '../../roles/role-name.ts';
import type { CapAction } from './cap-transitions.ts';
import type { LanesCap } from './lanes-cap.ts';
import type { CapCaller } from './read-cap-caller.ts';
import type { StoredCap } from './read-lanes-cap.ts';

export type CapRequest = { kind: 'off'; reason: string | null } | { kind: 'set'; cap: number; until: string | null; reason: string | null };

export interface CapChangeInput {
  caller: CapCaller;
  current: StoredCap;
  request: CapRequest;
  at: string;
}

export type CapDecision =
  | { ok: true; action: CapAction; cap: LanesCap; reason: string | null; by: string }
  | { ok: true; action: 'cap-off'; cap: null; error: string; reason: string | null; by: string }
  | { ok: true; action: null; by: string }
  | { ok: false; message: string };

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
  const current = input.current;
  if (request.kind === 'off') {
    if (caller.kind === 'delivery') {
      return { ok: false, message: `${delivery} may set a lanes cap or lower it, not lift it; ${owner} may` };
    }
    if (current.kind === 'bad') {
      return { ok: true, action: 'cap-off', cap: null, error: current.error, reason: request.reason, by: caller.by };
    }
    return current.kind === 'none' ? { ok: true, action: null, by: caller.by } : { ok: true, action: 'cap-off', cap: current.cap, reason: request.reason, by: caller.by };
  }
  const keep = caller.kind === 'delivery' && current.kind === 'set' ? current.cap : null;
  if (keep !== null && request.cap >= keep.cap) {
    return { ok: false, message: `${delivery} may only lower the lanes cap (now ${keep.cap}), not raise or keep it; ${owner} may` };
  }
  const until = request.until ?? keep?.until ?? null;
  const reason = request.reason ?? keep?.reason ?? null;
  return { ok: true, action: 'cap-set', cap: { cap: request.cap, until, reason, by: caller.by, at: input.at }, reason, by: caller.by };
}
