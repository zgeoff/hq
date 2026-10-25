import { match } from 'ts-pattern';
import type { LaneFit } from './build-lane-fit.ts';

export type ScaleReason = 'history' | 'no-fit';

export type LaneModel = { kind: 'fit'; fit: LaneFit; current: number } | { kind: 'scale'; reason: ScaleReason; current: number };

export function buildLaneFactor(model: LaneModel, lanes: number): number {
  return match(model)
    .with({ kind: 'scale' }, (scale) => (scale.current > 0 ? lanes / scale.current : 1))
    .with({ kind: 'fit' }, (fitted) => {
      const now = fitted.fit.base + fitted.fit.perLane * fitted.current;
      const wanted = fitted.fit.base + fitted.fit.perLane * lanes;
      return now > 0 ? Math.max(0, wanted) / now : 1;
    })
    .exhaustive();
}
