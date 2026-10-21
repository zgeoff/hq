import type { ShippedPeriod } from '../shipped/types.ts';
import type { KeyInput } from './pick-key-action.ts';

export type ShippedKeyAction = { kind: 'period'; period: ShippedPeriod } | { kind: 'help' } | { kind: 'close' };

// The Shipped tab's keys, outside a text box and with no modifier: a period, `?` for the key list,
// and Esc to close it.
export function pickShippedKey(input: KeyInput): ShippedKeyAction | null {
  if (input.inText || input.modified) {
    return null;
  }
  return SHIPPED_KEYS[input.key] ?? null;
}

const SHIPPED_KEYS: Record<string, ShippedKeyAction> = {
  t: { kind: 'period', period: 'today' },
  y: { kind: 'period', period: 'yesterday' },
  w: { kind: 'period', period: 'week' },
  '?': { kind: 'help' },
  Escape: { kind: 'close' },
};
