import { realRunner } from '../src/runner/real-runner.ts';
import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubImpAnswers {
  imps: string[]; // the names `imp ls --json` lists
  exec?: RunResult; // what `imp exec` answers; without it, the command after `--` runs here
}

export interface StubImpRunner {
  run: Runner;
  commands: string[][];
}

// A runner that stands in for the imp CLI: `imp ls --json` lists the given imps, and `imp exec`
// answers the given result or runs its command on this machine, as if inside the imp.
export function buildStubImpRunner(answers: StubImpAnswers): StubImpRunner {
  const commands: string[][] = [];
  const run: Runner = (cmd, opts) => {
    commands.push(cmd);
    if (cmd[1] === 'ls') {
      return Promise.resolve({ code: 0, stdout: JSON.stringify(answers.imps.map((name) => ({ name }))), stderr: '' });
    }
    if (answers.exec !== undefined) {
      return Promise.resolve(answers.exec);
    }
    return realRunner(cmd.slice(cmd.indexOf('--') + 1), opts);
  };
  return { run, commands };
}
