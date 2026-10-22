import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { timerUnits } from './timer-units.ts';

test("it carries the installing shell's backup settings into the backup service", () => {
  const units = timerUnits('/bin/hq', { HOME: '/home/kettle', HQ_BACKUP_REMOTE_ENV: '/srv/kettle/remote.env', HQ_AS: 'z-teapot' });

  expect(units.service).toBe(
    '[Unit]\nDescription=hq backup: hourly encrypted snapshot of hq state and z- transcripts\n\n[Service]\nType=oneshot\nEnvironment=PATH=/home/kettle/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-backup\n' +
      'Environment="HQ_BACKUP_REMOTE_ENV=/srv/kettle/remote.env"\nExecStart=/bin/hq backup run\nNice=10\nIOSchedulingClass=idle\n',
  );
});

test('it makes a relative backup path absolute against the installing directory', () => {
  const units = timerUnits('/bin/hq', { HOME: '/home/kettle', HQ_BACKUP_PASSWORD_FILE: 'kettle/password' });

  expect(units.service).toInclude(`Environment="HQ_BACKUP_PASSWORD_FILE=${join(process.cwd(), 'kettle', 'password')}"\n`);
});
