import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { PlaceTypes } from './types.ts';

const fileSchema = z.object({ placeTypes: z.unknown() }).partial();

const placesSchema = z.record(z.string(), z.unknown());

const PLACES = ['imp', 'local'] as const;

// pacing.json's `placeTypes: { imp?: [...], local?: [...] }`: the Type names each listed place takes;
// null when the file gives none. A place, list or name it cannot read throws.
export function parsePlaceTypes(raw: unknown): PlaceTypes | null {
  const file = fileSchema.safeParse(raw);
  const given = file.success ? file.data.placeTypes : undefined;
  if (given === undefined) {
    return null;
  }
  const places = placesSchema.safeParse(given);
  if (!places.success) {
    throw new HqError('no_lanes', 'pacing.json placeTypes: give { imp?: [Type, ...], local?: [Type, ...] }');
  }
  const placeTypes: PlaceTypes = {};
  for (const [place, types] of Object.entries(places.data)) {
    const known = PLACES.find((entry) => entry === place);
    if (known === undefined) {
      throw new HqError('no_lanes', `pacing.json placeTypes: unknown place ${place}; give imp or local`);
    }
    placeTypes[known] = parseTypeList(known, types);
  }
  return placeTypes;
}

const listSchema = z.array(z.unknown()).min(1);

function parseTypeList(place: string, raw: unknown): string[] {
  const list = listSchema.safeParse(raw);
  if (!list.success) {
    throw new HqError('no_lanes', `pacing.json placeTypes.${place}: give a list of one or more Type names`);
  }
  const types: string[] = [];
  for (const type of list.data) {
    if (typeof type !== 'string' || type.trim() === '') {
      throw new HqError('no_lanes', `pacing.json placeTypes.${place}: each Type name is a non-empty string`);
    }
    if (types.some((seen) => seen.toLowerCase() === type.toLowerCase())) {
      throw new HqError('no_lanes', `pacing.json placeTypes.${place}: ${type} is listed twice`);
    }
    types.push(type);
  }
  return types;
}
