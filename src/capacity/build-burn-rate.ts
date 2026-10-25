import { isBurnReset } from './is-burn-reset.ts';

export interface BurnPoint {
  at: string;
  percent: number | null;
  resetsAt: string | null;
}

export interface BurnRate {
  samples: number;
  latest: number | null;

  ratePerHour: number | null;
  since: string | null;
  reset: boolean;
}

const MIN_SAMPLES = 3;

export function buildBurnRate(points: readonly BurnPoint[]): BurnRate {
  const read = points.filter((point) => point.percent !== null);
  const start = getResetStart(read);
  const kept = read.slice(start);
  const latest = kept.at(-1)?.percent ?? null;
  const since = kept.at(0)?.at ?? null;
  const reset = start > 0;
  if (kept.length < MIN_SAMPLES) {
    return { samples: kept.length, latest, ratePerHour: null, since, reset };
  }
  return { samples: kept.length, latest, ratePerHour: fitSlope(kept), since, reset };
}

function getResetStart(read: readonly BurnPoint[]): number {
  let start = 0;
  for (let index = 1; index < read.length; index += 1) {
    const previous = read[index - 1];
    const current = read[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (isBurnReset(previous, current)) {
      start = index;
    }
  }
  return start;
}

const HOUR_MS = 3_600_000;

function fitSlope(kept: readonly BurnPoint[]): number | null {
  const origin = Date.parse(kept[0]?.at ?? '');
  const xs = kept.map((point) => (Date.parse(point.at) - origin) / HOUR_MS);
  const ys = kept.map((point) => point.percent ?? 0);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const spread = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (spread === 0) {
    return null;
  }
  const covariance = xs.reduce((sum, value, index) => sum + (value - meanX) * ((ys[index] ?? 0) - meanY), 0);
  return covariance / spread;
}
