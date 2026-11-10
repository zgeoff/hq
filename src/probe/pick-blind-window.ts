import { iso } from '../clock/iso.ts';

interface BlindWindowInput {
  fromMs: number;
  toMs: number;
  firstSampleMs: number | null;
  coveredMs: number;
}

interface BlindWindow {
  blindMs: number;
  probeStart: string | null;
}

export function pickBlindWindow(input: BlindWindowInput): BlindWindow {
  const startMs = input.firstSampleMs === null ? input.fromMs : Math.max(input.fromMs, input.firstSampleMs);
  const probeStartsInside = input.firstSampleMs !== null && input.firstSampleMs > input.fromMs && input.firstSampleMs <= input.toMs;

  return {
    blindMs: Math.max(0, input.toMs - startMs - input.coveredMs),
    probeStart: probeStartsInside ? iso(new Date(startMs)) : null,
  };
}
