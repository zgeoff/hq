import { HqError } from '../errors.ts';

// `hint` follows a failed check's message, such as the next step to take.
export function buildFailure(why: string, file: string | null, hint = ''): HqError {
  if (file === null) {
    return new HqError('noslop_failed', `noslop gave no check (${why}): this is no pass.${hint}`);
  }
  return new HqError('noslop_failed', `noslop gave no review (${why}): this is no review, not a pass. Output: ${file}`, { file });
}
