export type PinState = 'working' | 'idle' | 'needs_you' | 'exited' | 'asleep';

export interface PinRaw {
  id: string;
  name: string;
  state: string;
  alive: boolean;
  pinned?: boolean;
  lifecycle?: { desired?: string; vm?: string; harness?: string };
}

export interface Pin {
  id: string;
  name: string;
  state: PinState;
  lastActivityAt: string | null;
  idleMs: number | null; // null while working
}
