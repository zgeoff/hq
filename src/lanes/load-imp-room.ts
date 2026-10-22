import type { Database } from 'bun:sqlite';
import type { ImpRoom } from '../areas/types.ts';
import { capacitySettings } from '../capacity/capacity-settings.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';

// The imp slots the lanes may fill: capacity.sh's budget room, capped by the room under impd's
// non-Nix memory and vCPU lines, the capacity watch's own settings. With no impd reading 15 min
// fresh, every slot is held, as a wrong "free" overfills impd.
export function loadImpRoom(db: Database, size: ImpSize, at: Date = now()): ImpRoom {
  const FRESH_MIN = 15,
    reading = db.query('SELECT at, nonnix_awake_mib, nonnix_awake_vcpus FROM capacity_samples WHERE at <= ? ORDER BY at DESC LIMIT 1').get(iso(at)) as {
      at: string;
      nonnix_awake_mib: number | null;
      nonnix_awake_vcpus: number | null;
    } | null,
    settings = capacitySettings(db);
  if (reading === null || reading.nonnix_awake_mib === null || reading.nonnix_awake_vcpus === null || at.getTime() - Date.parse(reading.at) > FRESH_MIN * 60_000) {
    return { slots: 0, heldBy: 'no fresh impd reading', line: null };
  }
  return buildLineRoom({ awakeMib: reading.nonnix_awake_mib, maxMib: settings.nonnixMaxMib, awakeVcpus: reading.nonnix_awake_vcpus, maxVcpus: settings.nonnixMaxVcpus }, { ...size, impVcpus: settings.impVcpus });
}

// One more imp's memory, and the slots impd's budget leaves.
interface ImpSize {
  budgetSlots: number;
  impMib: number;
}

// The wholeSlots of the three limits sets the slots, and names itself; the budget wins a tie.
function buildLineRoom(line: NonNullable<ImpRoom['line']>, size: ImpSize & { impVcpus: number }): ImpRoom {
  const memorySlots = Math.max(0, Math.floor((line.maxMib - line.awakeMib) / size.impMib)),
    vcpuSlots = Math.max(0, Math.floor((line.maxVcpus - line.awakeVcpus) / size.impVcpus)),
    wholeSlots = Math.min(size.budgetSlots, memorySlots, vcpuSlots);
  if (wholeSlots === size.budgetSlots) {
    return { slots: wholeSlots, heldBy: 'imp budget or provider quota', line };
  }
  return { slots: wholeSlots, heldBy: wholeSlots === memorySlots ? 'impd at line' : 'impd at vCPU line', line };
}
