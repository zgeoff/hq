import { config } from '../config/config.ts';

export function getCutoff() {
  return config().HQ_STATS_CUTOFF;
}
