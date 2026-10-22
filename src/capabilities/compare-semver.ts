import { HqError } from '../errors.ts';
import { parseSemver } from './parse-semver.ts';

// Negative: a is older than b.
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a),
    y = parseSemver(b);
  if (!x || !y) {
    throw new HqError('bad_args', `not a version like 1.2.3: ${x ? b : a}`);
  }
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
