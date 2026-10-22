import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';

// The Sydney Monday on or before an instant.
export function mondayOf(at: Date): Date {
  const s = sydney(at);
  const dow = new Date(Date.UTC(s.y, s.mo - 1, s.d)).getUTCDay(); // 0 = Sunday
  return sydneyUtc(s.y, s.mo, s.d - ((dow + 6) % 7));
}
