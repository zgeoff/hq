export const LOW_WATER_TOPIC = 'lanes-low-water';
export const STALLED_TRIAGE_TOPIC = 'lanes-stalled-triage';

export function isLanesAlertTopic(topic: string | null): boolean {
  return topic === LOW_WATER_TOPIC || topic === STALLED_TRIAGE_TOPIC;
}
