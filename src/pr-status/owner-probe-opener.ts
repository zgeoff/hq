import type { OwnerProbeClient } from './read-owner-session.ts';

// Set only by code inside this process, such as a test: no flag or env variable reaches it, so a
// caller cannot use it to point the owner check at a daemon of its own.
export const OWNER_PROBE_OPENER: { open: (() => Promise<OwnerProbeClient>) | null } = { open: null };
