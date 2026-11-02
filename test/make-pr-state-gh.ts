import type { Runner } from '../src/runner/types.ts';

export interface PRStateGh {
  states: Record<string, string>;

  calls?: string[];

  fallback?: Runner;
}

export function makePRStateGh(gh: PRStateGh): Runner {
  return (cmd, opts) => {
    const line = cmd.join(' ');
    const match = /^gh pr view (?<n>\d+) -R (?<repo>\S+) --json state$/u.exec(line);
    const state = match?.groups ? gh.states[`${match.groups['repo']}#${match.groups['n']}`] : undefined;
    gh.calls?.push(line);
    if (!match?.groups) {
      return gh.fallback ? gh.fallback(cmd, opts) : Promise.resolve({ code: 1, stdout: '', stderr: `invented: unexpected ${line}` });
    }
    return Promise.resolve({ code: state ? 0 : 1, stdout: state ? JSON.stringify({ state }) : '', stderr: state ? '' : 'invented: no such PR' });
  };
}
