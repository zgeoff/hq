import { appendFileSync, readFileSync } from 'node:fs';
import { z } from 'zod';

// Stands in for `systemctl`: create-stub-systemctl.ts puts a wrapper first on PATH that runs this
// with its config file, then systemctl's own arguments.
const CONFIG = z.object({ log: z.string(), show: z.record(z.string(), z.string()) });

const [configPath, ...args] = process.argv.slice(2);
if (configPath === undefined) {
  throw new Error('run-stub-systemctl: no config file');
}
const config = CONFIG.parse(JSON.parse(readFileSync(configPath, 'utf8')));
appendFileSync(config.log, `${JSON.stringify(args)}\n`);

// Like systemctl show -p <name> --value: the value alone, and an empty line for a property it has no answer for.
if (args.includes('show')) {
  const property = args[args.indexOf('-p') + 1] ?? '';
  process.stdout.write(`${config.show[property] ?? ''}\n`);
}
