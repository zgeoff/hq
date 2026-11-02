import type { ImpRoom } from '../areas/types.ts';

export function formatLineRoom(room: ImpRoom): string {
  if (room.line === null) {
    return 'impd non-Nix line: no fresh reading, so every imp slot is held';
  }
  return `impd non-Nix line: ${room.line.awakeMib}/${room.line.maxMib} MiB, ${room.line.awakeVcpus}/${room.line.maxVcpus} vCPUs awake; ${room.slots} imp slot(s) to fill, set by ${room.heldBy}`;
}
