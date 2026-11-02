import { HqError } from '../errors.ts';
import { isAnswerSource } from './is-answer-source.ts';

export function requireAnswerSource(raw: string | undefined): string {
  const source = raw?.trim() ?? '';
  if (source === '') {
    throw new HqError('bad_args', '--source is required: chat:<id>, console:<id> or call:<id>; no answer is stored without its source');
  }
  if (!isAnswerSource(source)) {
    throw new HqError('bad_args', `--source "${source}" must be chat:<id>, console:<id> or call:<id>`);
  }
  return source;
}
