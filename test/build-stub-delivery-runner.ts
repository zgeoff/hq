import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubDeliveryAnswers {
  days: Record<string, string>;
  weekly?: string;
  rendered?: string;
  otherwise?: Runner;
}

export interface StubDeliveryRunner {
  run: Runner;
  merged: string[][];
}

export function buildStubDeliveryRunner(answers: StubDeliveryAnswers): StubDeliveryRunner {
  const merged: string[][] = [],
    run: Runner = (cmd, opts) => {
      if (cmd[1]?.endsWith('merged-prs.sh') !== true) {
        const fallback = answers.otherwise ?? (() => Promise.resolve({ code: 0, stdout: answers.rendered ?? '{}', stderr: '' }));
        return fallback(cmd, opts);
      }
      const args = cmd.slice(2),
        text = args[0] === 'weekly' ? answers.weekly : answers.days[args[1] ?? ''];
      merged.push(args);
      return Promise.resolve(buildMergedAnswer(text));
    };
  return { run, merged };
}

function buildMergedAnswer(text: string | undefined): RunResult {
  return text === undefined ? { code: 1, stdout: '', stderr: 'gh: offline' } : { code: 0, stdout: text, stderr: '' };
}
