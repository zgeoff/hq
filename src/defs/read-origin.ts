// The origin as configured, before any insteadOf rewrite. More than one url is refused: fetch
// uses the first and `config --get` reads the last.
export function readOrigin(dir: string): string | null {
  const r = Bun.spawnSync(['git', '-C', dir, 'config', '--get-all', 'remote.origin.url'], { timeout: 10_000 });
  const urls = r.exitCode === 0 ? r.stdout.toString().trim().split('\n').filter(Boolean) : [];
  return urls.length === 1 ? urls[0]! : urls.length ? `${urls.length} urls` : null;
}
