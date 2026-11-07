import type { ImpRoom } from '../areas/types.ts';

export function formatLineRoom(room: ImpRoom): string {
  if (room.line === null) {
    return 'impd non-Nix line: no fresh reading, so every imp slot is held';
  }
  const budget = room.budget === null ? '' : `; impd budget ${room.line.awakeMib + room.budget.nixAwakeMib}/${room.budget.budgetMib} MiB awake, ${room.budget.keptMib} MiB kept for priority imps`;
  return `impd non-Nix line: ${room.line.awakeMib}/${room.line.maxMib} MiB, ${room.line.awakeVcpus}/${room.line.maxVcpus} vCPUs awake${budget}; ${room.slots} imp slot(s) to fill, set by ${room.heldBy}`;
}
