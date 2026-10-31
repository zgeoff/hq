import type { PacingSlots, PlaceTypes } from '../lanes/types.ts';
import { getIssueAreas } from './get-issue-areas.ts';
import type { FocusEntry, FocusPick, FocusPlan, FocusReserve, FocusSlots, PlaceRoom, PlaceUnfit } from './types.ts';

// Fills the free slots from the queue. Each reserve first keeps its slots, less the area's running
// runs, for the area's first eligible issues; a reserved slot with nothing eligible is lent. Every
// slot left takes the queue in order. With places, an issue takes a free slot only at a place whose
// Type names hold its Type, a listed place before an unlisted one, and is passed over when none does.
export function buildFocusPlan(queue: readonly FocusEntry[], slots: FocusSlots, reserves: readonly FocusReserve[], runningByArea: Readonly<Record<string, number>>): FocusPlan {
  const picks: FocusPick[] = [];
  const lent: FocusPlan['lent'] = [];
  const taken = new Set<string>();
  const room = slots.places === null ? null : { free: { ...slots.places.free }, types: slots.places.types };
  const tryTake = (entry: FocusEntry, reserve: string | null): boolean => {
    const pick = { issue: entry.issue.identifier, term: entry.term, reserve };
    if (room === null) {
      picks.push(pick);
    } else {
      const place = pickPlace(room, entry.issue.type);
      if (place === null) {
        return false;
      }
      room.free[place] -= 1;
      picks.push({ ...pick, place });
    }
    taken.add(entry.issue.identifier);
    return true;
  };
  for (const reserve of reserves) {
    const kept = Math.max(0, reserve.slots - (runningByArea[reserve.area] ?? 0));
    const reserveRoom = Math.min(kept, slots.free - picks.length);
    let filled = 0;
    for (const entry of queue) {
      if (filled >= reserveRoom) {
        break;
      }
      if (!taken.has(entry.issue.identifier) && getIssueAreas(entry.issue.labels).includes(reserve.area) && tryTake(entry, reserve.area)) {
        filled += 1;
      }
    }
    if (filled < reserveRoom) {
      lent.push({ area: reserve.area, slots: reserveRoom - filled });
    }
  }
  for (const entry of queue) {
    if (picks.length >= slots.free) {
      break;
    }
    if (!taken.has(entry.issue.identifier)) {
      tryTake(entry, null);
    }
  }
  return slots.places === null ? { picks, lent } : { picks, lent, unfit: buildPlaceUnfit(queue, slots.free, slots.places) };
}

type Place = keyof PacingSlots;

const PLACES: readonly Place[] = ['imp', 'local'];

// A listed place first, so an issue that fits both leaves the unlisted slot for an issue that fits
// only there.
function pickPlace(room: PlaceRoom, issueType: string): Place | null {
  const open = PLACES.filter((place) => room.free[place] > 0 && isTypeTakenAt(room.types, place, issueType));
  return open.find((place) => room.types[place] !== undefined) ?? open[0] ?? null;
}

// An issue with no Type label fits only a place with no list.
function isTypeTakenAt(types: PlaceTypes, place: Place, issueType: string): boolean {
  const list = types[place];
  if (list === undefined) {
    return true;
  }
  return issueType !== 'none' && list.some((type) => type.toLowerCase() === issueType.toLowerCase());
}

// The free slots no eligible issue fits: the places with a free slot that no issue in the queue may
// take, within the pool's free count. None while nothing is eligible.
function buildPlaceUnfit(queue: readonly FocusEntry[], free: number, places: PlaceRoom): PlaceUnfit {
  if (queue.length === 0) {
    return { slots: 0, places: [] };
  }
  const unfitPlaces = PLACES.filter((place) => places.free[place] > 0 && !queue.some((entry) => isTypeTakenAt(places.types, place, entry.issue.type)));
  const fitting = PLACES.filter((place) => !unfitPlaces.includes(place)).reduce((sum, place) => sum + places.free[place], 0);
  return { slots: Math.max(0, free - fitting), places: unfitPlaces.map((place) => ({ place, types: places.types[place] ?? [] })) };
}
