import type { Database } from 'bun:sqlite';
import type { SlotCauseName } from '../types.ts';

export interface LanesDeps {
  db: Database;
}

export interface SlotMinutesInput {
  day: string;
  cause: SlotCauseName;
  minutes: number;
}
