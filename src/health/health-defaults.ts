export const HEALTH_DEFAULTS = {
  diskMinPct: 10,
  diskMinGiB: 5,
  memSomeAvg60: 20,
  memAvailMinPct: 5,
  restarts: 5,
  restartWindowMin: 30,
  backupMaxAgeHours: 3,
  // systemd-run leftovers, desktop app scopes, and a unit WSL always fails at boot (its network isn't networkd's)
  ignoreUnits: 'run-r*.service,app-*.scope,systemd-networkd-wait-online.service',
};
export type HealthSettings = typeof HEALTH_DEFAULTS;
