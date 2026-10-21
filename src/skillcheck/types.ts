export interface Form {
  top: string;
  verb: string | null; // null: the form takes no verb (hq status, hq news [--all])
  flags: Set<string>;
  positional: boolean; // takes a value that is not a flag (<id>, [id]): an unknown word may be one
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
