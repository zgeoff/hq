import { getHome as HOME } from './get-home.ts';

// The hourly timer, as real unit files so it survives a reboot.
export function timerUnits(hq: string): { service: string; timer: string } {
  return {
    service: `[Unit]\nDescription=hq backup: hourly encrypted snapshot of hq state and z- transcripts\n\n[Service]\nType=oneshot\nEnvironment=PATH=${HOME()}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-backup\nExecStart=${hq} backup run\nNice=10\nIOSchedulingClass=idle\n`,
    timer: `[Unit]\nDescription=hq backup every hour\n\n[Timer]\nOnCalendar=hourly\nRandomizedDelaySec=120\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`,
  };
}
