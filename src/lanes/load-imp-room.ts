import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { ImpRoom } from '../areas/types.ts';
import { capacitySettings } from '../capacity/capacity-settings.ts';
import type { Impd } from '../capacity/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { IMP_LINE_HELD } from './imp-line-held.ts';

const AwakeSampleRow = z
  .object({
    at: z.string(),
    nonnix_awake_mib: z.number().nullable(),
    nonnix_awake_vcpus: z.number().nullable(),
    nix_awake_mib: z.number().nullable(),
    impd_budget_mib: z.number().nullable(),
    impd_priority_kept_mib: z.number().nullable(),
    impd_committed_mib: z.number().nullable(),
  })
  .nullable();

type StoredSample = z.output<typeof AwakeSampleRow>;

const FRESH_MIN = 15;

// A live impd reading, when whole, sets the room. Without one, the newest stored sample does, held
// to 0 slots when it is over 15 min old, as a wrong "free" overfills impd.
export function loadImpRoom(db: Database, size: ImpSize, at: Date = now(), live: Impd | null = null): ImpRoom {
  const stored = AwakeSampleRow.parse(
    db.query('SELECT at, nonnix_awake_mib, nonnix_awake_vcpus, nix_awake_mib, impd_budget_mib, impd_priority_kept_mib, impd_committed_mib FROM capacity_samples WHERE at <= ? ORDER BY at DESC LIMIT 1').get(iso(at)),
  );
  const settings = capacitySettings(db);
  const reading = pickImpdReading(live, stored, at);
  if (reading === null) {
    return { slots: 0, heldBy: 'no fresh impd reading', line: null };
  }
  const line = {
    awakeMib: reading.nonnixAwakeMib,
    maxMib: settings.nonnixMaxMib,
    awakeVcpus: reading.nonnixAwakeVcpus,
    maxVcpus: settings.nonnixMaxVcpus,
    budgetMib: reading.budgetMib,
    nixAwakeMib: reading.nixAwakeMib,
    keptMib: reading.priorityKeptMib,
  };
  return buildLineRoom(line, { ...size, impVcpus: settings.impVcpus }, reading.committedMib);
}

interface WholeImpdReading {
  budgetMib: number;
  committedMib: number | null;
  nonnixAwakeMib: number;
  nonnixAwakeVcpus: number;
  nixAwakeMib: number;
  priorityKeptMib: number;
}

function pickImpdReading(live: Impd | null, stored: StoredSample, at: Date): WholeImpdReading | null {
  const fromLive = live === null ? null : toWholeReading(live);
  if (fromLive !== null) {
    return fromLive;
  }
  if (stored === null || at.getTime() - Date.parse(stored.at) > FRESH_MIN * 60_000) {
    return null;
  }
  return toWholeReading({
    budgetMib: stored.impd_budget_mib,
    usedMib: null,
    committedMib: stored.impd_committed_mib,
    nonnixAwakeMib: stored.nonnix_awake_mib,
    nonnixAwakeVcpus: stored.nonnix_awake_vcpus,
    nixAwakeMib: stored.nix_awake_mib,
    priorityKeptMib: stored.impd_priority_kept_mib,
  });
}

function toWholeReading(impd: Impd): WholeImpdReading | null {
  if (impd.budgetMib === null || impd.nonnixAwakeMib === null || impd.nonnixAwakeVcpus === null || impd.nixAwakeMib === null || impd.priorityKeptMib === null) {
    return null;
  }
  return {
    budgetMib: impd.budgetMib,
    committedMib: impd.committedMib,
    nonnixAwakeMib: impd.nonnixAwakeMib,
    nonnixAwakeVcpus: impd.nonnixAwakeVcpus,
    nixAwakeMib: impd.nixAwakeMib,
    priorityKeptMib: impd.priorityKeptMib,
  };
}

interface ImpSize {
  budgetSlots: number;
  impMib: number;
}

// impd counts the larger of what it has promised and what is awake as taken.
export function buildLineRoom(line: NonNullable<ImpRoom['line']>, size: ImpSize & { impVcpus: number }, committedMib: number | null): ImpRoom {
  const memorySlots = slotsIn(line.maxMib - line.awakeMib, size.impMib);
  const vcpuSlots = slotsIn(line.maxVcpus - line.awakeVcpus, size.impVcpus);
  const impdRoomMib = line.budgetMib - Math.max(committedMib ?? 0, line.awakeMib + line.nixAwakeMib);
  const lineSlots = Math.min(size.budgetSlots, memorySlots, vcpuSlots);
  const unkeptSlots = Math.min(lineSlots, slotsIn(impdRoomMib, size.impMib));
  const wholeSlots = Math.min(unkeptSlots, slotsIn(impdRoomMib - line.keptMib, size.impMib));
  const room = { slots: wholeSlots, line };
  if (wholeSlots === size.budgetSlots) {
    return { ...room, heldBy: 'imp budget or provider quota' };
  }
  if (wholeSlots === lineSlots) {
    return { ...room, heldBy: wholeSlots === memorySlots ? IMP_LINE_HELD.memory : IMP_LINE_HELD.vcpu };
  }
  return { ...room, heldBy: wholeSlots < unkeptSlots ? IMP_LINE_HELD.reservation : IMP_LINE_HELD.budget };
}

function slotsIn(room: number, perSlot: number): number {
  return Math.max(0, Math.floor(room / perSlot));
}
