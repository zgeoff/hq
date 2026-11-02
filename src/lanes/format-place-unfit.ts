import type { PlaceUnfit } from '../focus/types.ts';

export function formatPlaceUnfit(unfit: PlaceUnfit): string {
  return `${unfit.slots} free slot(s) fit no eligible issue (${unfit.places.map((entry) => `${entry.place} takes ${entry.types.join(', ')}`).join('; ')})`;
}
