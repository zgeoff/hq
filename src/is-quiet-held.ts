// Messages that wait out the quiet hours even on a retry: the weekly audit reminder and the unblock
// notice. The outbox keeps such a message pending and sends it at the next flush after them.
import { isQuiet } from './clock/is-quiet.ts';

export function isQuietHeld(topic: string | null, at: Date): boolean {
  return topic !== null && (topic.startsWith('job:weekly-audit:') || topic === 'unblock-changed') && isQuiet(at);
}
