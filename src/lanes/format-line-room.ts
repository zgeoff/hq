import type { ImpRoom } from '../areas/types.ts';

// The `hq lanes` line for impd's non-Nix line: how much is awake against it, and the slots it leaves.
export function formatLineRoom(room: ImpRoom): string {
  if (room.line === null) {
    return 'impd non-Nix line: no fresh reading, so every imp slot is held';
  }
  return `impd non-Nix line: ${room.line.awakeMib}/${room.line.maxMib} MiB, ${room.line.awakeVcpus}/${room.line.maxVcpus} vCPUs awake; ${room.slots} imp slot(s) to fill, set by ${room.heldBy}`;
}
