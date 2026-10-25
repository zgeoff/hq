import type { UsageSample } from '../usage-sample.ts';

export function collectAccountSeries(samples: readonly UsageSample[]): UsageSample[][] {
  const series = new Map<string, UsageSample[]>();
  for (const sample of samples) {
    const list = series.get(sample.account) ?? [];
    list.push(sample);
    series.set(sample.account, list);
  }
  return [...series.values()];
}
