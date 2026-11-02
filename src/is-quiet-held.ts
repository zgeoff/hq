import { isQuiet } from './clock/is-quiet.ts';

export function isQuietHeld(topic: string | null, at: Date): boolean {
  return topic !== null && (topic.startsWith('job:weekly-audit:') || topic === 'unblock-changed') && isQuiet(at);
}
