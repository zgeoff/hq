import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { transcriptPath } from '../repair/transcript-path.ts';
import type { FleetSession } from './types.ts';

// The compactions in a session's Claude Code transcript: each writes a system entry of subtype
// compact_boundary. The transcript starts with the session, so every one counts. Streams the
// file line by line; 0 when the session names no transcript or it cannot be read.
export async function readCompactionCount(session: FleetSession, fallbackCwd: string): Promise<number> {
  if (!session.agentSessionID) {
    return 0;
  }
  try {
    const path = transcriptPath(session.cwd ?? fallbackCwd, session.agentSessionID);
    if (!existsSync(path)) {
      return 0;
    }
    return await readBoundaryCount(path);
  } catch {
    return 0;
  }
}

const MARK = '"compact_boundary"';

async function readBoundaryCount(path: string): Promise<number> {
  let count = 0;
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    if (line.includes(MARK) && isBoundary(line)) {
      count += 1;
    }
  }
  return count;
}

const boundarySchema = z.looseObject({ type: z.literal('system'), subtype: z.literal('compact_boundary') });

function isBoundary(line: string): boolean {
  try {
    return boundarySchema.safeParse(JSON.parse(line)).success;
  } catch {
    return false;
  }
}
