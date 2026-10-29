import type { DesignMove } from './read-design-moves.ts';

// The lines hq run show prints for a run that went from its design pass to the build run.
export function formatDesignMoves(moves: readonly DesignMove[]): string[] {
  return moves.map((move) => `  design pass (${move.designLane}) became the build run ${move.at}; its sessions: ${move.designSessions.join(', ') || 'none'}`);
}
