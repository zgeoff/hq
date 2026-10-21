export function lanesEnv(home: string, processEnv: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = { PATH: `${home}/.local/bin:${home}/.bun/bin:/usr/local/bin:/usr/bin:/bin` };
  for (const [k, v] of Object.entries(processEnv)) if (k.startsWith('HQ_') && v !== undefined) env[k] = v;
  env['HQ_AS'] = 'hq-lanes';
  return env;
}
