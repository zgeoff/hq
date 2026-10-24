import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

interface StubSystemctlOptions {
  directory: string;

  // What `systemctl show -p <property> --value` prints, by property.
  show: Record<string, string>;
}

interface StubSystemctl {
  // A directory to put first on PATH; it holds only `systemctl`.
  bin: string;
  readCalls: () => string[][];
}

// Writes a `systemctl` that logs each call's arguments and exits 0, so a test can run code that drives
// systemd without reaching the real user manager.
export function createStubSystemctl(options: StubSystemctlOptions): StubSystemctl {
  const bin = join(options.directory, 'bin');
  const log = join(options.directory, 'systemctl.log');
  const config = join(options.directory, 'systemctl.json');
  mkdirSync(bin, { recursive: true });
  writeFileSync(log, '');
  writeFileSync(config, JSON.stringify({ log, show: options.show }));
  writeFileSync(join(bin, 'systemctl'), `#!/bin/sh\nexec '${process.execPath}' '${resolve(import.meta.dir, 'run-stub-systemctl.ts')}' '${config}' "$@"\n`);
  chmodSync(join(bin, 'systemctl'), 0o755);
  return {
    bin,
    readCalls: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => z.array(z.string()).parse(JSON.parse(line))),
  };
}
