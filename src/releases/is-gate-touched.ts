import type { Gate } from './parse-gate.ts';

// The gates follow Bun.Glob, as the repo that owns them matches them: `**` crosses directories.
export function isGateTouched(gate: Gate, files: readonly string[]): boolean {
  const paths = gate.paths.map((pattern) => new Bun.Glob(pattern));
  const ignore = gate.ignore.map((pattern) => new Bun.Glob(pattern));
  return files.some((file) => paths.some((glob) => glob.match(file)) && !ignore.some((glob) => glob.match(file)));
}
