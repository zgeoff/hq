import { wants } from './wants.ts';
import type { LaneView } from './types.ts';

export function buildLanesSignature(views: LaneView[]): string {
  return JSON.stringify(views.filter((v) => wants(v)).map((v) => [v.name, v.free, v.ready, v.lendTo]));
}
