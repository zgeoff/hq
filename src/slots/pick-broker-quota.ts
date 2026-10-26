import type { SlotRow } from '../capacity/fleet/types.ts';
import type { BrokerRecord } from './broker-record.ts';

interface BrokerProof {
  slot: number;
  proof: string;
  proofAgeHours: number;
}

export type BrokerQuota =
  | { state: 'none'; why: string }
  | (BrokerProof & { state: 'read'; used: number; resetsAt: string | null; readAt: string })
  | (BrokerProof & { state: 'unknown-proved' | 'unknown'; why: string });

const HOUR_MS = 3_600_000;

// The slot reads run every 2 h; a read older than one interval and a margin says nothing now.
const READ_FRESH_MS = 2.5 * HOUR_MS;

// A broker proof keeps an unread slot usable this long.
const PROOF_ROOM_MS = 24 * HOUR_MS;

// The imp broker's Claude quota: its slot's newest good read when fresh, else unknown, which still
// has room while the broker's proof is under 24 h old.
export function pickBrokerQuota(record: BrokerRecord | null, rows: readonly SlotRow[], at: Date): BrokerQuota {
  if (record === null) {
    return { state: 'none', why: 'no imp broker slot recorded: hq slots broker <n> --proof <id>' };
  }
  const proofMs = at.getTime() - Date.parse(record.at);
  const proof = { slot: record.slot, proof: record.proof, proofAgeHours: Math.round((proofMs / HOUR_MS) * 10) / 10 };
  const read = rows.findLast((row) => row.slot === record.slot && row.status === '200' && at.getTime() - Date.parse(row.at) <= READ_FRESH_MS);
  const fullest = read === undefined ? null : pickFullestWindow(read);
  if (read !== undefined && fullest !== null) {
    return { state: 'read', ...proof, used: fullest.used, resetsAt: fullest.resetsAt, readAt: read.at };
  }
  const why = `no slot read of the imp broker's slot ${record.slot} in the last 2.5 h`;
  if (proofMs < PROOF_ROOM_MS) {
    return { state: 'unknown-proved', ...proof, why };
  }
  return { state: 'unknown', ...proof, why: `${why}, and its proof is ${Math.floor(proofMs / HOUR_MS)} h old` };
}

// The fuller of the two windows, and when it resets.
function pickFullestWindow(row: SlotRow): { used: number; resetsAt: string | null } | null {
  if (row.five === null && row.seven === null) {
    return null;
  }
  if (row.seven === null || (row.five !== null && row.five >= row.seven)) {
    return { used: row.five ?? 0, resetsAt: row.fiveResetsAt };
  }
  return { used: row.seven, resetsAt: row.sevenResetsAt };
}
