import type { WrapUp } from './types.ts';

export type PartWrapOutcome = { kind: 'done' } | { kind: 'retry' };

// The stored id can be a short prefix of the full id the wrap-up reports. A wrap-up that forgot
// only sub-sessions left the session itself holding its slot, so the next sweep retries it.
export function pickPartWrapOutcome(sessionID: string, wrapUp: WrapUp): PartWrapOutcome {
  const stored = sessionID.toLowerCase();
  return wrapUp.forgotten.some((id) => id.toLowerCase().startsWith(stored)) ? { kind: 'done' } : { kind: 'retry' };
}
