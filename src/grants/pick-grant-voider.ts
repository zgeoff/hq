import { roleName } from '../roles/role-name.ts';
import type { GrantVoidCaller } from './types.ts';

// The name the caller may void under: the act's own actor when the caller is the session hq fleet
// recorded for it, else the owner when the caller is the owner's session, else null.
export function pickGrantVoider(caller: GrantVoidCaller, recorded: Record<string, string>, actor: string): string | null {
  if (caller.kind !== 'session') {
    return null;
  }
  const owner = roleName('owner');
  return [actor, owner].find((name) => recorded[name] === caller.id) ?? null;
}
