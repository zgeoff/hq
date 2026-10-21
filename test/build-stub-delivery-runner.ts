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

// A runner for the delivery-report scripts. merged-prs.sh `daily <date>` prints that date's text from
// `days` and `weekly` prints `weekly`; a missing one fails like gh offline. Any other command goes to
// `otherwise`, else prints `rendered`. `merged` collects each merged-prs.sh call's arguments.
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
