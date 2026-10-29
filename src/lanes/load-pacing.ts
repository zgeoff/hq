import { z } from 'zod';
import { parseLanes } from '../areas/parse-lanes.ts';
import type { LaneConfig } from '../areas/types.ts';
import { DEFAULT_DESIGN_SLOTS } from './default-design-slots.ts';
import { parseDesignSlots } from './parse-design-slots.ts';
import { parseLocalRoom } from './parse-local-room.ts';
import { parsePacingSlots } from './parse-pacing-slots.ts';
import type { DesignSlots, PacingSlots } from './types.ts';

export interface Pacing {
  impMib: number;
  lanes: LaneConfig[] | null;
  slots: PacingSlots | null;

  // The local sessions unattended providers may run on this host; null: no cap but the local slots.
  localRoom: number | null;

  // Claude's launch limit, providers.claude.threshold, in percent; null when the file gives none.
  claudeLaunchPct: number | null;

  // The design lane counts (designSlots, agentDesignSlots), their defaults when the file gives none or
  // gets one wrong; designError says which, apart from the lanes' error.
  design: DesignSlots;
  designError: string | null;
  error: string | null;
}

const fileSchema = z.object({ lanes: z.unknown(), slots: z.unknown() }).partial();

const impSchema = z.object({ imp: z.object({ impMib: z.number() }) });

const claudeProviderSchema = z.object({ threshold: z.number() });

const claudeSchema = z.object({ providers: z.object({ claude: claudeProviderSchema }) });

// pacing.json's imp size, lanes, slot caps and local room. A file hq can't read, or one with neither lanes nor
// slots, gives one pool of imp slots. Lanes or slots it refuses give an error, so the watcher nudges
// nothing on a config it can't read.
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
      return { impMib, lanes: null, slots: null, localRoom: null, claudeLaunchPct, ...design, error: null };
    }
    return { impMib, lanes: parseLanes(file), slots: parsePacingSlots(file), localRoom: parseLocalRoom(file), claudeLaunchPct, ...design, error: null };
  } catch (error) {
    return { impMib, lanes: null, slots: null, localRoom: null, claudeLaunchPct, ...design, error: `pacing.json: ${toMessage(error)}` };
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

// A design count pacing.json gets wrong gives the default counts and its own error, so the delivery lanes
// and slots still load.
function parseDesignCounts(file: unknown): DesignCountsRead {
  try {
    return { design: parseDesignSlots(file), error: null };
  } catch (error) {
    return { design: DEFAULT_DESIGN_SLOTS, error: `pacing.json: ${toMessage(error)}` };
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
