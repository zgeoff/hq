import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { roleName } from '../roles/role-name.ts';
import type { RoleProbe } from './read-role-session.ts';

// z-review alone records some things. --by and HQ_AS name z-review on the caller's word alone, so the
// atc session must be z-review's too.
export function requireReviewer(actor: string, probe: RoleProbe): void {
  if (actor !== roleName('reviewer')) {
    throw new HqError('bad_args', `only ${roleName('reviewer')} records this, not ${actor}`);
  }
  match(probe)
    .with({ verdict: 'match' }, () => null)
    .with({ verdict: 'other' }, () => {
      throw new HqError('bad_args', `only ${roleName('reviewer')}'s own atc session records this; this session is not it`);
    })
    .with({ verdict: 'unknown' }, (unknown) => {
      throw new HqError('bad_args', `hq could not check through atc that this is ${roleName('reviewer')}'s session (${unknown.cause}), so no record is stored`);
    })
    .exhaustive();
}
