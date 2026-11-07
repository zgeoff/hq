import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface StubOpOptions {
  directory: string;

  answers: Record<string, string>;

  // op's own errors can echo what it was given.
  failures?: Record<string, string>;
}

interface StubOp {
  bin: string;

  writeAnswers: (answers: Record<string, string>) => void;
}

export function createStubOp(options: StubOpOptions): StubOp {
  const bin = join(options.directory, 'bin');
  const config = join(options.directory, 'op.json');
  const failures = options.failures ?? {};
  mkdirSync(bin, { recursive: true });
  writeFileSync(config, JSON.stringify({ answers: options.answers, failures }));
  writeFileSync(join(bin, 'op'), `#!/bin/sh\nexec '${process.execPath}' '${resolve(import.meta.dir, 'run-stub-op.ts')}' --config '${config}' "$@"\n`);
  chmodSync(join(bin, 'op'), 0o755);
  return { bin, writeAnswers: (answers) => writeFileSync(config, JSON.stringify({ answers, failures })) };
}
