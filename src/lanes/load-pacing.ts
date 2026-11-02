import { z } from 'zod';
import { parseLanes } from '../areas/parse-lanes.ts';
import { toMessage } from '../runs/to-message.ts';
import type { LaneConfig } from '../areas/types.ts';
import { DEFAULT_DESIGN_SLOTS } from './default-design-slots.ts';
import { parseDesignSlots } from './parse-design-slots.ts';
import { parseLocalRoom } from './parse-local-room.ts';
import { parsePacingSlots } from './parse-pacing-slots.ts';
import { parsePlaceTypes } from './parse-place-types.ts';
import type { DesignSlots, PacingSlots, PlaceTypes } from './types.ts';

export interface Pacing {
  impMib: number;
  lanes: LaneConfig[] | null;
  slots: PacingSlots | null;
  placeTypes: PlaceTypes | null;
  localRoom: number | null;
  claudeLaunchPct: number | null;
  design: DesignSlots;
  designError: string | null;
  error: string | null;
}

const fileSchema = z.object({ lanes: z.unknown(), slots: z.unknown() }).partial();

const impSchema = z.object({ imp: z.object({ impMib: z.number() }) });

const claudeProviderSchema = z.object({ threshold: z.number() });

const claudeSchema = z.object({ providers: z.object({ claude: claudeProviderSchema }) });

export async function loadPacing(path: string): Promise<Pacing> {
  const DEFAULT_IMP_MIB = 2048;
  const file = await readPacingJSON(path);
  const parsed = fileSchema.safeParse(file);
  const shape = parsed.success ? parsed.data : {};
  const imp = impSchema.safeParse(file);
  const impMib = imp.success ? imp.data.imp.impMib : DEFAULT_IMP_MIB;
  const claude = claudeSchema.safeParse(file);
  const claudeLaunchPct = claude.success ? claude.data.providers.claude.threshold : null;
  const designRead = parseDesignCounts(file);
  const design = { design: designRead.design, designError: designRead.error };
  try {
    if (shape.lanes === undefined && shape.slots === undefined) {
      return { impMib, lanes: null, slots: null, placeTypes: null, localRoom: null, claudeLaunchPct, ...design, error: null };
    }
    const placeRead = parsePlaceTypes(file);
    if (placeRead.error !== null) {
      return { impMib, lanes: null, slots: null, placeTypes: null, localRoom: null, claudeLaunchPct, ...design, error: `pacing.json: ${placeRead.error}` };
    }
    return { impMib, lanes: parseLanes(file), slots: parsePacingSlots(file), placeTypes: placeRead.placeTypes, localRoom: parseLocalRoom(file), claudeLaunchPct, ...design, error: null };
  } catch (error) {
    return { impMib, lanes: null, slots: null, placeTypes: null, localRoom: null, claudeLaunchPct, ...design, error: `pacing.json: ${toMessage(error)}` };
  }
}

async function readPacingJSON(path: string): Promise<unknown> {
  try {
    const raw: unknown = await Bun.file(path).json();
    return raw;
  } catch {
    return null;
  }
}

interface DesignCountsRead {
  design: DesignSlots;
  error: string | null;
}

function parseDesignCounts(file: unknown): DesignCountsRead {
  try {
    return { design: parseDesignSlots(file), error: null };
  } catch (error) {
    return { design: DEFAULT_DESIGN_SLOTS, error: `pacing.json: ${toMessage(error)}` };
  }
}
