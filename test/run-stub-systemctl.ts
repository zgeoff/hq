import { appendFileSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const CONFIG = z.object({ log: z.string(), show: z.record(z.string(), z.string()), failedShows: z.record(z.string(), z.string()) });

const [configPath, ...args] = process.argv.slice(2);
if (configPath === undefined) {
  throw new Error('run-stub-systemctl: no config file');
}
const config = CONFIG.parse(JSON.parse(readFileSync(configPath, 'utf8')));
appendFileSync(config.log, `${JSON.stringify(args)}\n`);

if (args.includes('show')) {
  const property = args[args.indexOf('-p') + 1] ?? '';
  const failure = config.failedShows[property];
  if (failure !== undefined) {
    process.stderr.write(`${failure}\n`);
    process.exit(1);
  }
  process.stdout.write(`${config.show[property] ?? ''}\n`);
}
