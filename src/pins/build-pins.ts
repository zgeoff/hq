import { iso } from '../clock/iso.ts';
import { pinState } from './pin-state.ts';
import type { Pin, PinRaw } from './types.ts';

export function buildPins(raw: PinRaw[], activity: Map<string, number | null>, at: Date): Pin[] {
  return raw
    .filter((s) => s.pinned)
    .map((s): Pin => {
      const state = pinState(s);
      const last = activity.get(s.id) ?? null;
      return {
        id: s.id,
        name: s.name,
        state,
        lastActivityAt: last === null ? null : iso(new Date(last)),
        idleMs: state === 'working' || last === null ? null : Math.max(0, at.getTime() - last),
      };
    })
    .sort((a, b) => (b.idleMs ?? -1) - (a.idleMs ?? -1) || a.name.localeCompare(b.name));
}
