import { expect, test } from 'bun:test';
import { CAPACITY_DEFAULTS } from '../capacity/capacity-defaults.ts';
import { buildLanePlan } from './build-lane-plan.ts';

test.each([
  ['it fits 7 imp slots of 2048 MiB under both lines, and leaves the local lanes out', 7, 2048, { slots: 7, mib: 14_336, vcpus: 14, overMib: false, overVcpus: false }],
  ['it holds 8 imp slots of 2048 MiB at both lines as not over', 8, 2048, { slots: 8, mib: 16_384, vcpus: 16, overMib: false, overVcpus: false }],
  ['it puts 6 imp slots of 3072 MiB over the memory line only', 6, 3072, { slots: 6, mib: 18_432, vcpus: 12, overMib: true, overVcpus: false }],
  ['it puts 9 imp slots of 1024 MiB over the vCPU line only', 9, 1024, { slots: 9, mib: 9216, vcpus: 18, overMib: false, overVcpus: true }],
])('%s', (_case, impSlots, impMib, plan) => {
  const lanes = [
    { name: 'kettle', place: 'imp' as const, size: impSlots - 1, lends: true },
    { name: 'teapot', place: 'imp' as const, size: 1, lends: true },
    { name: 'flexible', place: 'local' as const, size: 5, lends: true },
  ];

  expect(buildLanePlan(lanes, impMib, { ...CAPACITY_DEFAULTS, nonnixMaxMib: 16_384, nonnixMaxVcpus: 16, impVcpus: 2 })).toStrictEqual({ ...plan, maxMib: 16_384, maxVcpus: 16 });
});
