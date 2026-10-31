import type { Flags } from '../cli.ts';
import { HqError } from '../errors.ts';
import type { BriefKind } from './types.ts';

const KINDS: readonly BriefKind[] = ['delivery', 'design', 'pr-walk'];

export function parseBriefKind(flags: Flags): BriefKind {
  const kind = flags.kind ?? 'delivery';
  const known = KINDS.find((candidate) => candidate === kind);
  if (known === undefined) {
    throw new HqError('bad_args', `--kind must be delivery, design or pr-walk: ${kind}`);
  }
  return known;
}
