import { config } from '../config/config.ts';

export const SWEEP_MINUTES = {
  finalMinutes: () => config().HQ_RUN_FINAL_MIN,
  reviewMinutes: () => config().HQ_RUN_REVIEW_MIN,
  quietMinutes: () => config().HQ_RUN_QUIET_MIN,
  repeatMinutes: () => config().HQ_RUN_REPEAT_MIN,
};
