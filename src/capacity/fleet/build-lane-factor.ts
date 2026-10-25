import { match } from 'ts-pattern';
import type { LaneFit } from './build-lane-fit.ts';

export type ScaleReason = 'history' | 'no-fit';

export type LaneModel = { kind: 'fit'; fit: LaneFit } | { kind: 'scale'; reason: ScaleReason };

export function buildLaneFactor(model: LaneModel, measured: number, wanted: number): number {
  return match(model)
    .with({ kind: 'scale' }, () => (measured > 0 ? wanted / measured : 1))
    .with({ kind: 'fit' }, (fitted) => {
      const from = fitted.fit.base + fitted.fit.perLane * measured;
      const to = fitted.fit.base + fitted.fit.perLane * wanted;
      return from > 0 ? Math.max(0, to) / from : 1;
    })
    .exhaustive();
}
