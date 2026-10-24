export interface BurnPoint {
  at: string;
  percent: number | null;
  resetsAt: string | null;
}

export interface BurnRate {
  // The samples after the window's latest reset that carry a reading.
  samples: number;
  latest: number | null;

  // Percent per hour by least squares; null with fewer than 3 samples.
  ratePerHour: number | null;
  since: string | null;
}

const MIN_SAMPLES = 3;

// The burn of one usage window. A window reset (the reset time moving on, or the reading falling)
// starts the fit again, so only the samples after the latest reset count.
export function buildBurnRate(points: readonly BurnPoint[]): BurnRate {
  const read = points.filter((point) => point.percent !== null);
  const start = getResetStart(read);
  const kept = read.slice(start);
  const latest = kept.at(-1)?.percent ?? null;
  const since = kept.at(0)?.at ?? null;
  if (kept.length < MIN_SAMPLES) {
    return { samples: kept.length, latest, ratePerHour: null, since };
  }
  return { samples: kept.length, latest, ratePerHour: fitSlope(kept), since };
}

const RESET_JUMP_MS = 60_000;

function getResetStart(read: readonly BurnPoint[]): number {
  let start = 0;
  for (let index = 1; index < read.length; index += 1) {
    const previous = read[index - 1];
    const current = read[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const fell = (current.percent ?? 0) < (previous.percent ?? 0);
    const moved = previous.resetsAt !== null && current.resetsAt !== null && Date.parse(current.resetsAt) - Date.parse(previous.resetsAt) > RESET_JUMP_MS;
    if (fell || moved) {
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
