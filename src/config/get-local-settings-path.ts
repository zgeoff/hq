export function getLocalSettingsPath(env: Record<string, string | undefined> = process.env): string {
  const base = env['XDG_CONFIG_HOME'] || `${env['HOME']}/.config`;
  return env['HQ_LOCAL_CONFIG'] || `${base}/hq/local.json`;
}
