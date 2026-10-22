import type { ConfigName } from './config.ts';

// Set or clear one setting for the duration of a call, then put it back. Returns the restorer.
export function overrideEnv(name: ConfigName, value: string | undefined): () => void {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  };
}
