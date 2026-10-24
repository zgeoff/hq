export interface SlotReading {
  slot: number;

  // The HTTP status as text, or op-failed or request-failed when no answer came.
  status: string;
  five: number | null;
  fiveResetsAt: string | null;
  seven: number | null;
  sevenResetsAt: string | null;
}

export interface SlotRow extends SlotReading {
  at: string;
  workingLanes: number;
}
