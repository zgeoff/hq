export const HEALTH_DEFAULTS = {
  diskMinPct: 10, // free space on /, the home filesystem and /tmp (a tmpfs in memory here)
  diskMinGiB: 5,
  memSomeAvg60: 20, // /proc/pressure/memory "some" avg60, percent
  memAvailMinPct: 5, // MemAvailable / MemTotal
  restarts: 5, // NRestarts gained within the window marks a restart loop
  restartWindowMin: 30,
  backupMaxAgeHours: 3, // once hq backup has run, a last good backup older than this is a problem
  // systemd-run leftovers, desktop app scopes, and a unit WSL always fails at boot (its network isn't networkd's)
  ignoreUnits: 'run-r*.service,app-*.scope,systemd-networkd-wait-online.service',
};
export type HealthSettings = typeof HEALTH_DEFAULTS;
