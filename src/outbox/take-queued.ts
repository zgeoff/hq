import { queued } from './queued.ts';

export function takeQueued(): number[] {
  return queued.splice(0);
}
