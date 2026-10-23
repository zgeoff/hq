import { OWNER } from '../releases/owner.ts';
import { isInstructionFile } from './is-instruction-file.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';

// The repos whose instruction files the owner's own held paths already cover, and the one repo
// whose PRs carry no instruction hold.
const WITHOUT_INSTRUCTION_HOLD = new Set(['hq', 'hq-private', 'nixie-definitions']);

// Which paths are a zgeoff repo's instruction files, held for the owner unless hq clears the hold.
// Null for a repo with none: another owner's, hq and hq-private (whose skills are the owner's own
// held paths) and nixie-definitions.
export function findInstructionHeldTest(parsed: ParsedRepo): ((path: string) => boolean) | null {
  if (parsed.owner !== OWNER || WITHOUT_INSTRUCTION_HOLD.has(parsed.repo)) {
    return null;
  }
  return isInstructionFile;
}
