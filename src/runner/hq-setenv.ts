// systemd-run starts a unit without the caller's environment: carry hq's own settings over.
export function hqSetenv(overrides: Record<string, string> = {}): string[] {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('HQ_') && v !== undefined) vars[k] = v;
  Object.assign(vars, overrides);
  return Object.entries(vars).map(([k, v]) => `--setenv=${k}=${v}`);
}
