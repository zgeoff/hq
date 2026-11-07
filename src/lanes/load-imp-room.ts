import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { ImpRoom } from '../areas/types.ts';
import { capacitySettings } from '../capacity/capacity-settings.ts';
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
  })
  .nullable();

// With no impd reading 15 min fresh, every slot is held, as a wrong "free" overfills impd.
export function loadImpRoom(db: Database, size: ImpSize, at: Date = now()): ImpRoom {
  const FRESH_MIN = 15;
  const reading = AwakeSampleRow.parse(
    db.query('SELECT at, nonnix_awake_mib, nonnix_awake_vcpus, nix_awake_mib, impd_budget_mib, impd_priority_kept_mib FROM capacity_samples WHERE at <= ? ORDER BY at DESC LIMIT 1').get(iso(at)),
  );
  const settings = capacitySettings(db);
  if (
    reading === null ||
    reading.nonnix_awake_mib === null ||
    reading.nonnix_awake_vcpus === null ||
    reading.nix_awake_mib === null ||
    reading.impd_budget_mib === null ||
    reading.impd_priority_kept_mib === null ||
    at.getTime() - Date.parse(reading.at) > FRESH_MIN * 60_000
  ) {
    return { slots: 0, heldBy: 'no fresh impd reading', line: null };
  }
  const line = {
    awakeMib: reading.nonnix_awake_mib,
    maxMib: settings.nonnixMaxMib,
    awakeVcpus: reading.nonnix_awake_vcpus,
    maxVcpus: settings.nonnixMaxVcpus,
    budgetMib: reading.impd_budget_mib,
    nixAwakeMib: reading.nix_awake_mib,
    keptMib: reading.impd_priority_kept_mib,
  };
  return buildLineRoom(line, { ...size, impVcpus: settings.impVcpus });
}

interface ImpSize {
  budgetSlots: number;
  impMib: number;
}

function buildLineRoom(line: NonNullable<ImpRoom['line']>, size: ImpSize & { impVcpus: number }): ImpRoom {
  const memorySlots = slotsIn(line.maxMib - line.awakeMib, size.impMib);
  const vcpuSlots = slotsIn(line.maxVcpus - line.awakeVcpus, size.impVcpus);
  const impdRoomMib = line.budgetMib - line.awakeMib - line.nixAwakeMib;
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
