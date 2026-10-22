export interface Judged<T> {
  value: T | null;
  why: string | null;
  failedCalls: number;
}

// A finding as hq stores it in noslop_rounds.findings. Rows from before 0.59.0 hold only the first four fields.
export interface StoredFinding {
  id: string;
  lens: string;
  severity: string;
  title: string;
  criterion?: string | null | undefined;
  rule?: string | null | undefined;
  path?: string | null | undefined;
  startLine?: number | null | undefined;
  endLine?: number | null | undefined;
  writtenByChange?: boolean | null | undefined;

  // Whether the finding landed on code the PR had not changed since its first review: set at record time only.
  late?: boolean | null | undefined;
}
