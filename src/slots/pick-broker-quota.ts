import type { SlotRow } from '../capacity/fleet/types.ts';
import { isSameSevenReset } from '../capacity/fleet/is-same-seven-reset.ts';
import type { BrokerRecord } from './broker-record.ts';

interface BrokerProof {
  slot: number;
  proof: string;
  proofAgeHours: number;
}

export type BrokerQuota =
  | { state: 'none'; why: string }
  | (BrokerProof & { state: 'read'; from: 'slot-read' | 'login-sample'; used: number; resetsAt: string | null; readAt: string })
  | (BrokerProof & { state: 'unknown-proved' | 'unknown'; why: string });

interface UsageWindows {
  five: number | null;
  fiveResetsAt: string | null;
  seven: number | null;
  sevenResetsAt: string | null;
}

// This machine's Claude login, sampled every few minutes; it is the broker slot's account whenever
// its 7-day reset matches that slot's.
export interface LoginSample extends UsageWindows {
  at: string;
}

const HOUR_MS = 3_600_000;

// The slot reads run every 2 h; a read older than one interval and a margin says nothing now.
const READ_FRESH_MS = 2.5 * HOUR_MS;

const PROOF_ROOM_MS = 24 * HOUR_MS;

export function pickBrokerQuota(record: BrokerRecord | null, rows: readonly SlotRow[], sample: LoginSample | null, at: Date): BrokerQuota {
  if (record === null) {
    return { state: 'none', why: 'no imp broker slot recorded: hq slots broker <n> --proof <id>' };
  }
  const proofMs = at.getTime() - Date.parse(record.at);
  const proof = { slot: record.slot, proof: record.proof, proofAgeHours: Math.round((proofMs / HOUR_MS) * 10) / 10 };
  const isFresh = (readAt: string) => at.getTime() - Date.parse(readAt) <= READ_FRESH_MS;
  const slotRows = rows.filter((row) => row.slot === record.slot && row.status === '200');
  const newest = slotRows.at(-1);
  const read = newest !== undefined && isFresh(newest.at) ? newest : undefined;
  const lastSevenResetsAt = slotRows.findLast((row) => row.sevenResetsAt !== null)?.sevenResetsAt ?? null;
  const matchReset = read === undefined ? lastSevenResetsAt : read.sevenResetsAt;
  const sampleFullest = sample !== null && matchReset !== null && isFresh(sample.at) && isSampleOnSlot(sample, matchReset, read) ? pickFullestWindow(sample) : null;
  if (sample !== null && sampleFullest !== null) {
    return { state: 'read', ...proof, from: 'login-sample', used: sampleFullest.used, resetsAt: sampleFullest.resetsAt, readAt: sample.at };
  }
  const fullest = read === undefined ? null : pickFullestWindow(read);
  if (read !== undefined && fullest !== null) {
    return { state: 'read', ...proof, from: 'slot-read', used: fullest.used, resetsAt: fullest.resetsAt, readAt: read.at };
  }
  const why = `no slot read of the imp broker's slot ${record.slot} in the last 2.5 h`;
  if (proofMs < PROOF_ROOM_MS) {
    return { state: 'unknown-proved', ...proof, why };
  }
  return { state: 'unknown', ...proof, why: `${why}, and its proof is ${Math.floor(proofMs / HOUR_MS)} h old` };
}

function isSampleOnSlot(sample: LoginSample, sevenResetsAt: string, read: SlotRow | undefined): boolean {
  if (sample.sevenResetsAt === null || !isSameSevenReset(sample.sevenResetsAt, sevenResetsAt)) {
    return false;
  }
  return read === undefined || Date.parse(sample.at) > Date.parse(read.at);
}

function pickFullestWindow(windows: UsageWindows): { used: number; resetsAt: string | null } | null {
  if (windows.five === null && windows.seven === null) {
    return null;
  }
  if (windows.seven === null || (windows.five !== null && windows.five >= windows.seven)) {
    return { used: windows.five ?? 0, resetsAt: windows.fiveResetsAt };
  }
  return { used: windows.seven, resetsAt: windows.sevenResetsAt };
}
