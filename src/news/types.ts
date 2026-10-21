import type { NEWS_TOPICS } from './news-topics.ts';

type NewsTopic = (typeof NEWS_TOPICS)[number];

export interface NewsItem {
  id: number;
  from_name: string;
  topic: NewsTopic;
  text: string;
  issue: string | null;
  link: string | null;
  needs_geoff: number;
  added_at: string;
  read_at: string | null;
  tag: string | null;
}

export interface AddNewsInput {
  from: string;
  topic: string;
  text: string;
  issue: string | null;
  link: string | null;
  needsGeoff: boolean;
  tag?: string | null;
}
