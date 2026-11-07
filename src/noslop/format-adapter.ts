import { match } from 'ts-pattern';
import type { PickedAdapter } from './pick-review-adapter.ts';

export function formatAdapter(picked: PickedAdapter): string {
  return match(picked)
    .with({ source: 'flag' }, (flagged) => `${formatModel(flagged)} (--adapter)`)
    .with({ source: 'setting' }, (stored) => `${formatModel(stored)} (stored setting until ${stored.until ?? 'unknown'}; hq noslop adapter codex ends it)`)
    .with({ source: 'default' }, () => 'noslop\'s default')
    .exhaustive();
}

function formatModel(picked: PickedAdapter): string {
  return picked.adapter === 'claude' ? 'claude on Opus' : (picked.adapter ?? 'noslop\'s default');
}
