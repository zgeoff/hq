export interface TrimReport {
  role: string;
  file: string;
  dryRun: boolean;

  written: boolean;
  limitBytes: number;
  targetBytes: number;
  beforeBytes: number;
  afterBytes: number;
  entriesMoved: number;
  archive: string;
  backup: string;
}

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
