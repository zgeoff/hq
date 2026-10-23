// The installed hq is a compiled binary, where process.execPath is hq itself, so bun is named.
export function spawnGrants(argv: string[], cwd: string): Bun.SyncSubprocess<'pipe', 'pipe'> {
  return Bun.spawnSync(argv, { cwd, timeout: 60_000 });
}
