import { buildUnitSettings } from '../fleet/build-unit-settings.ts';

// The hourly timer, as real unit files so it survives a reboot. The service carries the installing
// shell's settings, so a scheduled backup reads the same remote and paths as a manual one.
export function timerUnits(hq: string, env: Record<string, string | undefined>): { service: string; timer: string } {
  return {
    service: `[Unit]\nDescription=hq backup: hourly encrypted snapshot of hq state and z- transcripts\n\n[Service]\nType=oneshot\nEnvironment=PATH=${env['HOME'] ?? '/'}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-backup\n${buildUnitSettings('backup', env)}ExecStart=${hq} backup run\nNice=10\nIOSchedulingClass=idle\n`,
    timer: `[Unit]\nDescription=hq backup every hour\n\n[Timer]\nOnCalendar=hourly\nRandomizedDelaySec=120\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`,
  };
}
