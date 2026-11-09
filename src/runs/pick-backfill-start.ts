import { match } from 'ts-pattern';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BackfillAttach = 'run-add' | 'session-add';

export function pickBackfillStart(attach: BackfillAttach, runCreatedAt: string, nowMs: number): number {
  const dayAgoMs = nowMs - DAY_MS;
  return match(attach)
    .with('run-add', () => dayAgoMs)
    .with('session-add', () => Math.max(Date.parse(runCreatedAt), dayAgoMs))
    .exhaustive();
}
