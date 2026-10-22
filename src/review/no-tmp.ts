// z-stu (2026-10-17): a Codex review once filled /tmp with Bun caches it chose to make. Both
// passes get this as developer instructions (`codex review --base` takes no prompt), run with
// TMPDIR in the review's own scratch folder, and that folder goes when the review ends.
export const NO_TMP = 'Use Bun\'s shared install cache; never set BUN_INSTALL_CACHE_DIR or BUN_TMPDIR, and make no folder in /tmp.';
