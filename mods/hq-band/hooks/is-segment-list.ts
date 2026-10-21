import type { BandSegment } from '../types';

// Whether `hq band --json`'s segments are ones the band can draw. hq's CLI test runs its own
// output through this check, so a change on either side fails there.
export function isSegmentList(value: unknown): value is BandSegment[] {
  return Array.isArray(value) && value.every((segment: Partial<BandSegment> | null) => typeof segment?.text === 'string' && typeof segment.key === 'string' && ['ok', 'warn', 'alert'].includes(segment.tone ?? ''));
}
