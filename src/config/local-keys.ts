// The only settings the local file may supply: machine-specific values that stay out of tracked
// code. A variable set in the environment wins over the file.
export const LOCAL_KEYS = ['HQ_NOSLOP_OP_VAULT', 'HQ_NOSLOP_OP_ITEM', 'HQ_LINEAR_OP_REF', 'HQ_PROBE_TARGET', 'HQ_PROBE_READY', 'HQ_CLOUD_METRICS_URL', 'HQ_CLOUD_HOST'] as const;

export type LocalKey = (typeof LOCAL_KEYS)[number];
