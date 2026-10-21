export const MARK_KINDS = ['skills', 'grant', 'hq', 'other'] as const;

export interface Mark {
  id: number;
  at: string;
  kind: (typeof MARK_KINDS)[number];
  text: string;
  ref: string | null;
  added_by: string;
  added_at: string;
  grant_name: string | null;
}
