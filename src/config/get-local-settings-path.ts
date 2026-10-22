// ${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json unless HQ_LOCAL_CONFIG names another path.
export function getLocalSettingsPath(env: Record<string, string | undefined> = process.env): string {
  const base = env['XDG_CONFIG_HOME'] || `${env['HOME']}/.config`;
  return env['HQ_LOCAL_CONFIG'] || `${base}/hq/local.json`;
}
