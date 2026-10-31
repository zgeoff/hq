import type { PlaceUnfit } from '../focus/types.ts';

// The free slots no eligible issue fits, with each place and the Type names it takes.
export function formatPlaceUnfit(unfit: PlaceUnfit): string {
  return `${unfit.slots} free slot(s) fit no eligible issue (${unfit.places.map((entry) => `${entry.place} takes ${entry.types.join(', ')}`).join('; ')})`;
}
