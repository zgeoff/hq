import type { AdapterSetting } from './read-adapter-setting.ts';
import type { ReviewAdapter } from './parse-review-adapter.ts';

export interface PickedAdapter {
  adapter: ReviewAdapter | undefined;
  source: 'flag' | 'setting' | 'default';
  until: string | null;
}

export function pickReviewAdapter(flag: ReviewAdapter | undefined, setting: AdapterSetting, now: Date): PickedAdapter {
  if (flag !== undefined) {
    return { adapter: flag, source: 'flag', until: null };
  }
  if (setting !== null && now.getTime() < Date.parse(setting.until)) {
    return { adapter: setting.adapter, source: 'setting', until: setting.until };
  }
  return { adapter: undefined, source: 'default', until: null };
}
