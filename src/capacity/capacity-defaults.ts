export const CAPACITY_DEFAULTS = {
  nonnixMaxMib: 16384,

  // A backstop of 8 imps: impd runs imps at a lower CPU priority than Nix.
  nonnixMaxVcpus: 16,
  impVcpus: 2,

  cloudMinAvailGiB: 4,
  claudeSevenDayPct: 85,
  claudeFiveHourPct: 90,

  opDailyPct: 50,
  holdSamples: 2,
};
