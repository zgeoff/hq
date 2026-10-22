export interface Rec {
  line: number;
  obj: Record<string, unknown> & { uuid: string; parentUuid?: string | null; type?: string; isSidechain?: boolean; message?: { id?: string; content?: unknown } };
}

export interface Change {
  line: number; // 1-based
  uuid: string;
  from: string | null;
  to: string;
  why: string;
}

export interface Split {
  use: string; // the server_tool_use record
  result: string; // the advisor_tool_result record
  interlopers: string[]; // records between them, nearest the use first
  anchor: string; // the turn's last record; the interlopers go after it
}

export interface RepairPlan {
  lines: number;
  splits: Split[];
  offBranch: string[]; // split results not on the live branch: left alone
  changes: Change[];
  leaf: string | null;
}
