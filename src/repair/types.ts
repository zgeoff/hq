export interface Rec {
  line: number;
  obj: Record<string, unknown> & { uuid: string; parentUuid?: string | null; type?: string; isSidechain?: boolean; message?: { id?: string; content?: unknown } };
}

export interface Change {
  line: number;
  uuid: string;
  from: string | null;
  to: string;
  why: string;
}

export interface Split {
  use: string;
  result: string;
  interlopers: string[];
  anchor: string;
}

export interface RepairPlan {
  lines: number;
  splits: Split[];
  offBranch: string[];
  changes: Change[];
  leaf: string | null;
}
