import { sydney } from '../morning/sydney.ts';
import type { SlotCause } from './types.ts';

const STALLED_MINUTES = 30;

export interface StalledTriageInputs {
  slotCause: SlotCause;
  held: boolean;
  at: Date;
  alerted: boolean;
  toldAt: string | null;
}

// Quiet hours stop nothing: the owner's session holds any push itself.
export function pickStalledTriage(input: StalledTriageInputs): { subjectID: string; minutes: number; text: string } | null {
  const since = input.slotCause.since;
  const slots = input.slotCause.slots;
  if (input.held || input.alerted || input.slotCause.cause !== 'triage' || slots < 1 || since === null) {
    return null;
  }
  const minutes = Math.floor((input.at.getTime() - Date.parse(since)) / 60_000);
  if (minutes < STALLED_MINUTES) {
    return null;
  }
  const when = input.toldAt === null ? null : sydney(new Date(input.toldAt));
  const told = when === null ? '' : ` z-triage got the low-water message at ${String(when.h).padStart(2, '0')}:${String(when.mi).padStart(2, '0')}.`;
  return { subjectID: `slot-cause-stalled:triage:${since}`, minutes, text: `Lanes: ${slots} slots empty for ${minutes} min with Backlog issues to promote (triage).${told}` };
}
