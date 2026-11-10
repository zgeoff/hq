import { formatProbeStart } from './format-probe-start.ts';

export function formatProbeNote(probeStart: string | null | undefined): string {
  return probeStart ? `probe from ${formatProbeStart(probeStart)}` : '';
}
