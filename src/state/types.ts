export interface TrimReport {
  role: string;
  file: string;
  dryRun: boolean;

  // false when nothing moved or --dry-run
  written: boolean;
  limitBytes: number;

  // the size hq state trim cuts to, below the limit
  targetBytes: number;
  beforeBytes: number;
  afterBytes: number;
  entriesMoved: number;
  archive: string;
  backup: string;
}

// Every filesystem operation hq state trim makes, so a test can inject a failure at any step.
export interface StateFiles {
  readText: (path: string) => string;
  probeExists: (path: string) => boolean;
  readMode: (path: string) => number;
  copyNew: (from: string, to: string) => void;
  appendText: (path: string, text: string, mode: number) => void;
  changeMode: (path: string, mode: number) => void;
  writeText: (path: string, text: string, mode: number) => void;
  renameFile: (from: string, to: string) => void;
  removeFile: (path: string) => void;
}
