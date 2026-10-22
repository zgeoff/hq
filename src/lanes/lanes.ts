import { config } from '../config/config.ts';
import { DEFS } from '../prompts/defs.ts';

export const LANES = {
  freeMinutes: () => config().HQ_LANES_FREE_MIN,
  repeatMinutes: () => config().HQ_LANES_REPEAT_MIN,
  followMinutes: () => config().HQ_LANES_FOLLOW_MIN,
  readyFreshMinutes: () => config().HQ_LANES_READY_FRESH_MIN,
  readyZeroFreshMinutes: () => config().HQ_LANES_READY_ZERO_FRESH_MIN,
  readyStaleMinutes: () => config().HQ_LANES_READY_STALE_MIN,
  capacityScript: () => config().HQ_CAPACITY ?? `${DEFS()}/skills/agent-delegation/scripts/capacity.sh`,
};
