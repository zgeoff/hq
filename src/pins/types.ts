import type { z } from 'zod';
import type { pinListSchema } from './pin-list-schema.ts';

export type PinState = 'working' | 'idle' | 'needs_you' | 'exited' | 'asleep';

export type PinRaw = z.infer<typeof pinListSchema>['sessions'][number];

export interface Pin {
  id: string;
  name: string;
  state: PinState;
  lastActivityAt: string | null;
  idleMs: number | null;
}
