// The review pass runs in Codex's workspace-write sandbox, which can write the worktree but not
// Bun's shared install cache, so its installs failed with EROFS. The cache joins its writable roots.
export function bunCacheDir(): string {
  return process.env['BUN_INSTALL_CACHE_DIR'] ?? `${process.env['HOME']}/.bun/install/cache`;
}
