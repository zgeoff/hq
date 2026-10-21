// Another git (a session's own fetch) holding or moving a ref: it passes, so it isn't a fault.
// Only contention matches: the ref moved under us, or its .lock file exists. Permission, disk
// and other errors also say "cannot lock ref", and they stay red at once.
export const REF_LOCK = /is at [0-9a-f]{7,64} but expected [0-9a-f]{7,64}|Unable to create '[^']*\.lock': File exists/;
