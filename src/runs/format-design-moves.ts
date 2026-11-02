import type { DesignMove } from './read-design-moves.ts';

export function formatDesignMoves(moves: readonly DesignMove[]): string[] {
  return moves.map((move) => `  design pass (${move.designLane}) became the build run ${move.at}; its sessions: ${move.designSessions.join(', ') || 'none'}`);
}
