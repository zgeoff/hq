import type { AdapterSetting } from './read-adapter-setting.ts';
import type { ReviewAdapter } from './parse-review-adapter.ts';

export interface PickedAdapter {
  adapter: ReviewAdapter | undefined;
  source: 'flag' | 'setting' | 'default';
}

export function pickReviewAdapter(flag: ReviewAdapter | undefined, setting: AdapterSetting, now: Date): PickedAdapter {
  if (flag !== undefined) {
    return { adapter: flag, source: 'flag' };
  }
  if (setting !== null && now.getTime() < Date.parse(setting.until)) {
    return { adapter: setting.adapter, source: 'setting' };
  }
  return { adapter: undefined, source: 'default' };
}
