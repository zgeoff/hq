export const CAPACITY_DEFAULTS = {
  nonnixMaxMib: 16_384,

  // A backstop of 8 imps: impd runs imps at a lower CPU priority than Nix.
  nonnixMaxVcpus: 16,
  impVcpus: 2,

  // geoffcloud's fixed hugetlb pool for imps never counts as MemAvailable, so the host sits near 4 GiB.
  cloudMinAvailGiB: 2,
  claudeSevenDayPct: 85,
  claudeFiveHourPct: 90,

  opDailyPct: 50,
  holdSamples: 2,
};
