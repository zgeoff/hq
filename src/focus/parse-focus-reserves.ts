import { HqError } from '../errors.ts';
import { FOCUS_AREAS } from './focus-areas.ts';
import type { FocusReserve } from './types.ts';

// Each `--reserve <area>=<n>`: a known area, n from 1 to 20, each area once.
export function parseFocusReserves(raw: readonly string[]): FocusReserve[] {
  const MAX_SLOTS = 20;
  const reserves: FocusReserve[] = [];
  for (const entry of raw) {
    const parts = /^(?<area>[a-z-]+)=(?<slots>\d+)$/u.exec(entry.trim())?.groups;
    const area = FOCUS_AREAS.find((name) => name === parts?.['area']);
    const slots = Number(parts?.['slots']);
    if (area === undefined || !Number.isInteger(slots) || slots < 1 || slots > MAX_SLOTS) {
      throw new HqError('bad_args', `focus: bad --reserve "${entry}"; give <area>=<n>, n from 1 to ${MAX_SLOTS}, area one of ${FOCUS_AREAS.join('|')}`);
    }
    if (reserves.some((reserve) => reserve.area === area)) {
      throw new HqError('bad_args', `focus: --reserve names ${area} twice`);
    }
    reserves.push({ area, slots });
  }
  return reserves;
}
