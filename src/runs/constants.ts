// A merged run's wrap-up retries a work check that can clear later, such as one that hit the imp
// RAM limit, at most this many times and only this soon after the merge.
export const MAX_MERGED_RETRIES = 2;
export const MERGED_RETRY_WINDOW_MS = 10 * 60_000;
