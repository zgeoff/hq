import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface StubOpOptions {
  directory: string;

  // What `op read <reference>` prints, by op:// reference; any other reference fails.
  answers: Record<string, string>;
}

interface StubOp {
  // A directory to put first on PATH; it holds only `op`.
  bin: string;
}

// Writes an `op` that answers `op read` from a table, so a test can run code that reads 1Password
// without reaching the real op or a real token.
export function createStubOp(options: StubOpOptions): StubOp {
  const bin = join(options.directory, 'bin');
  const config = join(options.directory, 'op.json');
  mkdirSync(bin, { recursive: true });
  writeFileSync(config, JSON.stringify({ answers: options.answers }));
  writeFileSync(join(bin, 'op'), `#!/bin/sh\nexec '${process.execPath}' '${resolve(import.meta.dir, 'run-stub-op.ts')}' --config '${config}' "$@"\n`);
  chmodSync(join(bin, 'op'), 0o755);
  return { bin };
}
