export interface Form {
  top: string;
  verb: string | null;
  flags: Set<string>;
  positional: boolean;
}

export interface Use {
  file: string;
  line: number;
  text: string;
  top: string;
  verb: string | null;
  flags: string[];
}

export interface Problem {
  use: Use;
  why: string;
}
