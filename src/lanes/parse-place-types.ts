import { z } from 'zod';
import type { PlaceTypes } from './types.ts';

const fileSchema = z.object({ placeTypes: z.unknown() }).partial();

const placesSchema = z.record(z.string(), z.unknown());

const PLACES = ['imp', 'local'] as const;

export interface PlaceTypesRead {
  placeTypes: PlaceTypes | null;
  error: string | null;
}

// pacing.json's `placeTypes: { imp?: [...], local?: [...] }`: the Type names each listed place takes;
// null when the file gives none. A place, list or name it cannot read gives null and the error.
export function parsePlaceTypes(raw: unknown): PlaceTypesRead {
  const file = fileSchema.safeParse(raw);
  const given = file.success ? file.data.placeTypes : undefined;
  if (given === undefined) {
    return { placeTypes: null, error: null };
  }
  const places = placesSchema.safeParse(given);
  if (!places.success) {
    return { placeTypes: null, error: 'pacing.json placeTypes: give { imp?: [Type, ...], local?: [Type, ...] }' };
  }
  const placeTypes: PlaceTypes = {};
  for (const [place, types] of Object.entries(places.data)) {
    const known = PLACES.find((entry) => entry === place);
    if (known === undefined) {
      return { placeTypes: null, error: `pacing.json placeTypes: unknown place ${place}; give imp or local` };
    }
    const list = parseTypeList(known, types);
    if (list.types === null) {
      return { placeTypes: null, error: list.error };
    }
    placeTypes[known] = list.types;
  }
  return { placeTypes, error: null };
}

const listSchema = z.array(z.unknown()).min(1);

type TypeListRead = { types: string[]; error: null } | { types: null; error: string };

function parseTypeList(place: string, raw: unknown): TypeListRead {
  const list = listSchema.safeParse(raw);
  if (!list.success) {
    return { types: null, error: `pacing.json placeTypes.${place}: give a list of one or more Type names` };
  }
  const types: string[] = [];
  for (const type of list.data) {
    if (typeof type !== 'string' || type.trim() === '') {
      return { types: null, error: `pacing.json placeTypes.${place}: each Type name is a non-empty string` };
    }
    if (types.some((seen) => seen.toLowerCase() === type.toLowerCase())) {
      return { types: null, error: `pacing.json placeTypes.${place}: ${type} is listed twice` };
    }
    types.push(type);
  }
  return { types, error: null };
}
