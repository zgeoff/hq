import { expect, test } from 'bun:test';
import { formatLanePlan } from './format-lane-plan.ts';

test.each([
  ['it gives the room left for imps outside the lanes when the plan fits', { slots: 7, mib: 14_336, vcpus: 14, overMib: false, overVcpus: false }, 'imp lane plan: 7 slot(s), all full, take 14336/16384 MiB and 14/16 vCPUs; 2048 MiB and 2 vCPUs left for imps outside the lanes'],
  ['it warns when the plan crosses a line', { slots: 9, mib: 18_432, vcpus: 18, overMib: true, overVcpus: true }, "imp lane plan: 9 slot(s), all full, take 18432/16384 MiB and 18/16 vCPUs: over impd's non-Nix line; shrink the imp lanes in pacing.json or raise the line"],
])('%s', (_case, plan, line) => {
  expect(formatLanePlan({ maxMib: 16_384, maxVcpus: 16, ...plan })).toBe(line);
});
