import { iso } from '../clock/iso.ts';
import { DELIVERY_GRACE_MINUTES } from './delivery-grace-minutes.ts';

export interface DesignCauseInput {
  // The agent design lanes free while a needs-design ticket waits for one: at most one per ticket.
  waitingLanes: number;
  waitingSince: string | null;
  at: Date;
}

export interface DesignCause {
  // The idle agent design lanes past the grace; 0 before it and while no lane waits on a ticket.
  slots: number;
  waitingSince: string | null;
}

// The design cause: a free agent design lane while a needs-design agent-queue ticket waits, for more than
// the grace. It is kept apart from the delivery pool's cause, which a design lane never changes.
export function buildDesignCause(input: DesignCauseInput): DesignCause {
  if (input.waitingLanes === 0) {
    return { slots: 0, waitingSince: null };
  }
  const waitingSince = input.waitingSince ?? iso(input.at);
  const waitingMs = input.at.getTime() - Date.parse(waitingSince);
  return { slots: waitingMs > DELIVERY_GRACE_MINUTES * 60_000 ? input.waitingLanes : 0, waitingSince };
}
