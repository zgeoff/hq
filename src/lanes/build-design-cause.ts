import { iso } from '../clock/iso.ts';
import { DELIVERY_GRACE_MINUTES } from './delivery-grace-minutes.ts';

export interface DesignCauseInput {
  waitingLanes: number;
  waitingSince: string | null;
  at: Date;
}

export interface DesignCause {
  slots: number;
  waitingSince: string | null;
}

export function buildDesignCause(input: DesignCauseInput): DesignCause {
  if (input.waitingLanes === 0) {
    return { slots: 0, waitingSince: null };
  }
  const waitingSince = input.waitingSince ?? iso(input.at);
  const waitingMs = input.at.getTime() - Date.parse(waitingSince);
  return { slots: waitingMs > DELIVERY_GRACE_MINUTES * 60_000 ? input.waitingLanes : 0, waitingSince };
}
