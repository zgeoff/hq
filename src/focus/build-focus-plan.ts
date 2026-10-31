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
  const seating = slots.places === null ? null : makeSeatIssue(slots.places);
  const tryTake = (entry: FocusEntry, reserve: string | null): boolean => {
    if (seating !== null && !seating.trySeat(entry.issue.identifier, entry.issue.type)) {
      return false;
    }
    picks.push({ issue: entry.issue.identifier, term: entry.term, reserve });
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
  if (seating === null || slots.places === null) {
    return { picks, lent };
  }
  return { picks: picks.map((pick) => ({ issue: pick.issue, term: pick.term, reserve: pick.reserve, place: seating.getPlace(pick.issue) })), lent, unfit: buildPlaceUnfit(queue, slots.free, slots.places) };
}

type Place = keyof PacingSlots;

const PLACES: readonly Place[] = ['imp', 'local'];

interface SeatIssue {
  trySeat: (issue: string, issueType: string) => boolean;
  getPlace: (issue: string) => Place;
}

// Seats each issue in turn at a place that takes its Type, a listed place first. When every such place
// is full, an augmenting path moves seated issues to their other places to make room, so the plan
// fills as many slots as it can and never unseats an earlier issue for a later one.
function makeSeatIssue(places: PlaceRoom): SeatIssue {
  const room = { ...places.free };
  const seated = new Map<string, { place: Place; issueType: string }>();
  const fitting = (issueType: string): Place[] => {
    const fits = PLACES.filter((place) => isTypeTakenAt(places.types, place, issueType));
    return [...fits.filter((place) => places.types[place] !== undefined), ...fits.filter((place) => places.types[place] === undefined)];
  };
  const moveTo = (issue: string, issueType: string, place: Place): void => {
    const from = seated.get(issue)?.place;
    if (from !== undefined) {
      room[from] += 1;
    }
    room[place] -= 1;
    seated.set(issue, { place, issueType });
  };
  const trySeatAway = (issue: string, issueType: string, away: Place | null, visited: Set<Place>): boolean => {
    const fits = fitting(issueType).filter((place) => place !== away);
    const open = fits.find((place) => room[place] > 0);
    if (open !== undefined) {
      moveTo(issue, issueType, open);
      return true;
    }
    for (const place of fits.filter((entry) => !visited.has(entry))) {
      visited.add(place);
      for (const [other, seat] of seated) {
        if (seat.place === place && other !== issue && trySeatAway(other, seat.issueType, place, visited)) {
          moveTo(issue, issueType, place);
          return true;
        }
      }
    }
    return false;
  };
  return {
    trySeat: (issue, issueType) => trySeatAway(issue, issueType, null, new Set()),
    getPlace: (issue) => {
      const seat = seated.get(issue);
      if (seat === undefined) {
        throw new Error(`no place seated for ${issue}`);
      }
      return seat.place;
    },
  };
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
