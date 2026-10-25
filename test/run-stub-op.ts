import { readFileSync } from 'node:fs';
import { z } from 'zod';

// Stands in for 1Password's `op`: create-stub-op.ts puts a wrapper first on PATH that runs this with
// its config file, then op's own arguments.
const CONFIG = z.object({ answers: z.record(z.string(), z.string()) });

const [configPath, verb, reference] = process.argv.slice(2);
if (configPath === undefined) {
  throw new Error('run-stub-op: no config file');
}
const config = CONFIG.parse(JSON.parse(readFileSync(configPath, 'utf8')));
const answer = verb === 'read' && reference !== undefined ? config.answers[reference] : undefined;

// Like op read: the secret and a newline on success, and a message on stderr with exit 1 for an item it cannot read.
if (answer === undefined) {
  process.stderr.write('[ERROR] could not read the secret: invented: no such item\n');
  process.exit(1);
}
process.stdout.write(`${answer}\n`);
