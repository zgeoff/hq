// Every pinned atc session, longest idle first, so z-delivery can sweep them
// in one command and wrap up the ones that no longer need the owner.
import type { PinRaw, PinState } from './types.ts';

export function pinState(s: PinRaw): PinState {
  const lc = s.lifecycle ?? {};
  if (lc.vm === 'asleep' || lc.harness === 'suspended' || (lc.desired === 'sleep' && !s.alive)) return 'asleep';
  if (!s.alive || s.state === 'exited') return 'exited';
  if (s.state === 'needs_you') return 'needs_you';
  if (s.state === 'running') return 'working';
  return 'idle';
}
