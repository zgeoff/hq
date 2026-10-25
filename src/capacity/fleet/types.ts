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

  // When the last slot's next 7-day reset arrives, or 8 days on: where the run stops.
  endsAt: string;
}

export interface FleetSlotView {
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

interface FleetForecast {
  switches: SimSwitch[];
  pause: SimPause | null;

  // The highest lane count with no pause before the last slot's next 7-day reset, and when that reset is.
  safeCap: { lanes: number; endsAt: string } | null;
  endsAt: string;
}

export interface FleetView {
  // Why the slot reads are not set up, or null when they are.
  notSetUp: string | null;
  limit: number;
  active: number | null;
  slots: FleetSlotView[];
  lanes: { working: number; cap: number | null };

  // The burn in points per hour at this hour of the day and the current lane count.
  ratePerHour: { five: number; seven: number } | null;

  // True when the burn at other lane counts is scaled linearly, for want of 7 days of lane history.
  scaled: boolean;
  forecast: FleetForecast | null;

  // Why there is no forecast.
  note: string | null;
}
