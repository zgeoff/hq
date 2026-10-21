import { queued } from './queued.ts';

// The ids this process queued since the last call, and forget them.
export function takeQueued(): number[] {
  return queued.splice(0);
}
