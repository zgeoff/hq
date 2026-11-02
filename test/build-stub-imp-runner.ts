import { realRunner } from '../src/runner/real-runner.ts';
import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubImpAnswers {
  imps: string[];

  exec?: RunResult;
}

export interface StubImpRunner {
  run: Runner;
  commands: string[][];
}

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
