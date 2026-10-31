import { config } from '../config/config.ts';
import { DEFS as readDefsDir } from '../prompts/defs.ts';
import { readLaneSkillDir } from './read-lane-skill-dir.ts';

export const LANES = {
  freeMinutes: () => config().HQ_LANES_FREE_MIN,
  repeatMinutes: () => config().HQ_LANES_REPEAT_MIN,
  followMinutes: () => config().HQ_LANES_FOLLOW_MIN,
  readyFreshMinutes: () => config().HQ_LANES_READY_FRESH_MIN,
  readyZeroFreshMinutes: () => config().HQ_LANES_READY_ZERO_FRESH_MIN,
  readyStaleMinutes: () => config().HQ_LANES_READY_STALE_MIN,
  capacityScript: () => config().HQ_CAPACITY ?? `${readLaneSkillDir(readDefsDir())}/scripts/capacity.sh`,
};
