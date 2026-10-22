import { iso } from '../clock/iso.ts';

export function toUTCDay(t: number) {
  return iso(new Date(t)).slice(0, 10);
}
