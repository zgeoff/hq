import type { StoredEvent } from '../read-events.ts';

export const SCOPE_HOLD_ACTIONS = ['handed-in-held', 'handed-in-released'] as const;

// The newest of the hold and release events says whether the last Scope check found open boxes.
export function isScopeHeld(waitsOn: string | null, newest: StoredEvent | undefined): boolean {
  return waitsOn !== null && waitsOn.trim() !== '' && newest?.action === 'handed-in-held';
}
