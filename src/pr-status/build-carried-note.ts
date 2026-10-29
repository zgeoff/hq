export interface CarriedWords {
  source: string;
  note: string | null;
}

// The note a carried lgtm stores: whose words it was, and the patch-id that matched at both heads.
export function buildCarriedNote(from: CarriedWords, patchID: string): string {
  const words = from.note === null ? from.source : `${from.source}: ${from.note}`;
  return `from ${words}; patch-id ${patchID}`;
}
