export interface LanePoint {
  lanes: number;
  rate: number;
}

export interface LaneFit {
  base: number;
  perLane: number;
}

// rate = base + perLane x lanes by least squares. Null when the lane counts never differ or the
// rate falls as lanes rise, since neither says what one more lane costs.
export function buildLaneFit(points: readonly LanePoint[]): LaneFit | null {
  if (points.length < 3) {
    return null;
  }
  const meanLanes = points.reduce((sum, point) => sum + point.lanes, 0) / points.length;
  const meanRate = points.reduce((sum, point) => sum + point.rate, 0) / points.length;
  const spread = points.reduce((sum, point) => sum + (point.lanes - meanLanes) ** 2, 0);
  if (spread === 0) {
    return null;
  }
  const covariance = points.reduce((sum, point) => sum + (point.lanes - meanLanes) * (point.rate - meanRate), 0);
  const perLane = covariance / spread;
  if (perLane <= 0) {
    return null;
  }
  return { base: meanRate - perLane * meanLanes, perLane };
}
