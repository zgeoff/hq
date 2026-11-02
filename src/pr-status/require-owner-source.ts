import { HqError } from '../errors.ts';
import { roleName } from '../roles/role-name.ts';
import { findSourceRefusal } from './find-source-refusal.ts';
import type { SourceRequest } from './find-source-refusal.ts';
import { requireAnswerSource } from './require-answer-source.ts';
import type { OwnerProbe } from './read-owner-session.ts';
import type { PRCommandInput } from './run-pr-command.ts';

export async function requireOwnerSource(input: PRCommandInput, request: Omit<SourceRequest, 'source'>): Promise<string> {
  const source = requireAnswerSource(input.flags.source);
  const probe: OwnerProbe = source.startsWith('chat:') ? await input.readOwnerSession() : { verdict: 'other' };
  const refusal = findSourceRefusal(input.db, { ...request, source }, probe);
  if (refusal !== null) {
    throw new HqError('bad_args', `--source refused: ${refusal}; ask ${roleName('owner')} to record it`);
  }
  return source;
}
