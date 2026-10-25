export interface SlotReading {
  slot: number;
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

export interface SimSlot {
  slot: number;
  five: number;
  fiveResetsAt: Date | null;
  seven: number;
  sevenResetsAt: Date;
}

export interface SimInput {
  now: Date;
  slots: readonly SimSlot[];
  active: number;
  limit: number;
  rateAt: (at: Date) => { five: number; seven: number };
}

export interface SimSwitch {
  at: string;
  from: number | null;
  to: number;
}

export interface SimPause {
  start: string;
  end: string;
  hours: number;
}

export interface SimResult {
  switches: SimSwitch[];
  pause: SimPause | null;
  endsAt: string;
}

export type FleetSlotView = KnownSlotView | UnknownSlotView;

interface KnownSlotView {
  reading: 'known';
  slot: number;
  active: boolean;
  status: string;
  five: number | null;
  fiveResetsAt: string | null;
  seven: number | null;
  sevenResetsAt: string | null;
  readAt: string;
  readAgeMin: number;
}

interface UnknownSlotView {
  reading: 'unknown';
  slot: number;
  active: false;
  status: string;
  readAt: string;
  readAgeMin: number;
}

interface FleetForecast {
  switches: SimSwitch[];
  pause: SimPause | null;
  safeCap: { lanes: number; endsAt: string } | null;
  endsAt: string;
}

export interface FleetView {
  notSetUp: string | null;
  limit: number;
  active: number | null;
  slots: FleetSlotView[];
  lanes: { working: number; cap: number | null };
  ratePerHour: { five: number; seven: number } | null;
  scaled: boolean;
  forecast: FleetForecast | null;
  note: string | null;
}
