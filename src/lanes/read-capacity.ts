import type { RunResult, Runner } from '../runner/types.ts';
import { LANES } from './lanes.ts';
import { loadPacing } from './load-pacing.ts';
import { pacingPath } from './pacing-path.ts';
import type { Capacity, Sample } from './types.ts';

// capacity.sh's reading with pacing.json's lanes and slot caps. A capacity failure is the sample's error first;
// with capacity read, lanes pacing.json refuses are.
export async function readCapacity(run: Runner): Promise<Sample> {
  const pacing = await loadPacing(pacingPath()),
    ran = await run(['bash', LANES.capacityScript()]),
    read = parseCapacityRun(ran);
  return { cap: read.cap, impMib: pacing.impMib, lanes: pacing.lanes, slots: pacing.slots, localRoom: pacing.localRoom, error: read.cap === null ? read.error : pacing.error };
}

interface CapacityRead {
  cap: Capacity | null;
  error: string | null;
}

function parseCapacityRun(ran: RunResult): CapacityRead {
  if (ran.code !== 0) {
    return { cap: null, error: `capacity.sh exit ${ran.code}: ${ran.stderr.trim().slice(0, 200)}` };
  }
  const cap = parseCapacity(ran.stdout);
  if (cap === null) {
    return { cap: null, error: 'capacity.sh printed no JSON' };
  }

  // An imp read that failed is no reading, not full lanes.
  if ((cap.imp?.error ?? '') !== '' || typeof cap.imp?.freeMib !== 'number') {
    return { cap: null, error: `imp: ${cap.imp?.error ?? 'no freeMib'}` };
  }
  return { cap, error: null };
}

function parseCapacity(stdout: string): Capacity | null {
  try {
    return JSON.parse(stdout) as Capacity;
  } catch {
    return null;
  }
}
