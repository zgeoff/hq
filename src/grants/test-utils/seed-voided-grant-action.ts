import invariant from 'tiny-invariant';
import { fleetIds } from '../../atc/fleet-ids.ts';
import { setMeta } from '../../db/set-meta.ts';
import { roleName } from '../../roles/role-name.ts';
import type { GrantActionInput, GrantActionRow } from '../types.ts';
import { voidGrantAction } from '../void-grant-action.ts';
import { seedGrantAction } from './seed-grant-action.ts';
import type { GrantsDeps } from './types.ts';

interface VoidedGrantActionInput extends Partial<GrantActionInput> {
  reason?: string;
  voidedAt?: string;
}

export async function seedVoidedGrantAction(deps: GrantsDeps, input: VoidedGrantActionInput = {}): Promise<GrantActionRow> {
  const { reason = 'logged before the merge failed', voidedAt = '2026-10-14T01:30:00Z', ...actionInput } = input;
  const action = seedGrantAction(deps, actionInput);
  const owner = roleName('owner');
  setMeta(deps.db, 'fleet_ids', JSON.stringify({ ...fleetIds(deps.db), [owner]: 'seeded-owner-session' }));
  const voided = await voidGrantAction({
    db: deps.db,
    args: { id: action.id, reason },
    probe: { openClient: () => Promise.resolve({ peerSession: 'seeded-owner-session', close: () => {} }) },
    clock: () => new Date(voidedAt),
  });
  invariant(voided.voided_by === owner);

  return voided;
}
