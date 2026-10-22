import type { Targets } from './types.ts';

export const DEFAULT_TARGETS: Targets = {
  bugs: { op: '<', value: 20, until: '2026-11-02' },
  features: { op: '>=', value: 60 },
  deploys: { op: '>=', value: 90 },
  downtime: { op: '<', value: 15, detectMax: 5 },
  ciwaste: { op: '<=', value: 10 },
  mustfix: { op: '<=', value: 20 },
  cost: { op: '<=', value: 50 },
};
