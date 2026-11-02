export const LOCAL_KEYS = ['HQ_NOSLOP_OP_VAULT', 'HQ_NOSLOP_OP_ITEM', 'HQ_LINEAR_OP_REF', 'HQ_PROBE_TARGET', 'HQ_PROBE_READY', 'HQ_CLOUD_METRICS_URL', 'HQ_CLOUD_HOST'] as const;

export type LocalKey = (typeof LOCAL_KEYS)[number];
