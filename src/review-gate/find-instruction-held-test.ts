import { OWNER } from '../releases/owner.ts';
import { isInstructionFile } from './is-instruction-file.ts';
import type { ParsedRepo } from '../noslop/parse-lower-repo.ts';

const WITHOUT_INSTRUCTION_HOLD = new Set(['hq', 'hq-private', 'nixie-definitions']);

export function findInstructionHeldTest(parsed: ParsedRepo): ((path: string) => boolean) | null {
  if (parsed.owner !== OWNER || WITHOUT_INSTRUCTION_HOLD.has(parsed.repo)) {
    return null;
  }
  return isInstructionFile;
}
