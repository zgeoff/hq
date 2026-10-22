export const CAPACITY_DEFAULTS = {
  nonnixMaxMib: 16384, // non-Nix imps awake: alert when over this (urgent: any hour)

  // vCPUs of the non-Nix imps awake: the lanes fill no slot that takes them over this. One more
  // imp takes impVcpus. A backstop of 8 imps: impd runs imps at a lower CPU priority than Nix.
  nonnixMaxVcpus: 16,
  impVcpus: 2,

  // cloud MemAvailable: alert when under this
  cloudMinAvailGiB: 4,
  claudeSevenDayPct: 85, // alert at or above
  claudeFiveHourPct: 90,

  // 1Password account requests today: alert at or above this share of the daily limit.
  opDailyPct: 50,
  holdSamples: 2, // consecutive samples a breach (or a recovery) must hold
};
