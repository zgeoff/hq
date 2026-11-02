// The outbox topics of the lanes alerts that a lanes hold defers: flush keeps them pending while a hold
// is active, so a message queued before the hold goes out only after it.
export const LOW_WATER_TOPIC = 'lanes-low-water';
export const STALLED_TRIAGE_TOPIC = 'lanes-stalled-triage';

export function isLanesAlertTopic(topic: string | null): boolean {
  return topic === LOW_WATER_TOPIC || topic === STALLED_TRIAGE_TOPIC;
}
