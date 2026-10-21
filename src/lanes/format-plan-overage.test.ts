import { expect, test } from 'bun:test';
import { formatPlanOverage } from './format-plan-overage.ts';

test.each([
  ['it gives nothing for a plan under both lines', { mib: 14_336, vcpus: 14, overMib: false, overVcpus: false }, null],
  ['it names the memory line alone when only memory is over', { mib: 18_432, vcpus: 12, overMib: true, overVcpus: false }, 'plan 18/16 GiB'],
  ['it names the vCPU line alone when only vCPUs are over', { mib: 9216, vcpus: 18, overMib: false, overVcpus: true }, 'plan 18/16 vCPU'],
  ['it names both lines when both are over', { mib: 20_480, vcpus: 20, overMib: true, overVcpus: true }, 'plan 20/16 GiB, 20/16 vCPU'],
])('%s', (_case, plan, text) => {
  expect(formatPlanOverage({ slots: 10, maxMib: 16_384, maxVcpus: 16, ...plan })).toBe(text);
});
