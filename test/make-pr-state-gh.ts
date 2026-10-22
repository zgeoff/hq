import type { Runner } from '../src/runner/types.ts';

export interface PRStateGh {
  // "owner/repo#n" -> the state GitHub reports, such as MERGED.
  states: Record<string, string>;

  // Every command the stand-in saw.
  calls?: string[];

  // Answers any other command; left out, those fail.
  fallback?: Runner;
}

// A stand-in for `gh pr view <n> -R <owner/repo> --json state`: a known PR answers {"state": ...},
// an unknown one fails as gh does for a PR it can't find.
export function makePRStateGh(gh: PRStateGh): Runner {
  return (cmd, opts) => {
    const line = cmd.join(' '),
      m = /^gh pr view (?<n>\d+) -R (?<repo>\S+) --json state$/u.exec(line),
      state = m?.groups ? gh.states[`${m.groups['repo']}#${m.groups['n']}`] : undefined;
    gh.calls?.push(line);
    if (!m?.groups) {
      return gh.fallback ? gh.fallback(cmd, opts) : Promise.resolve({ code: 1, stdout: '', stderr: `invented: unexpected ${line}` });
    }
    return Promise.resolve({ code: state ? 0 : 1, stdout: state ? JSON.stringify({ state }) : '', stderr: state ? '' : 'invented: no such PR' });
  };
}
