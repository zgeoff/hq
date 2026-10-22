const GH_TOKEN_SHAPE = /^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})$/;

// A session's own atc variables would make a child act as that session.
export function cleanEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, ...extra };
  delete env['ATC_SESSION_ID'];
  delete env['ATC_SESSION_RECORD'];
  delete env['ATC_SOCKET'];
  // gh prefers GITHUB_TOKEN and GH_TOKEN over its own login. One that is not shaped like a GitHub
  // token (2026-10-17: ~/.env's unrun `$(...)` text, read by Bun) makes every call 401, so drop it
  // and let gh use hosts.yml.
  for (const k of ['GITHUB_TOKEN', 'GH_TOKEN'] as const) if (env[k] !== undefined && !GH_TOKEN_SHAPE.test(env[k]!)) delete env[k];
  return env;
}
