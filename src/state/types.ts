export interface TrimReport {
  role: string;
  file: string;
  dryRun: boolean;

  // false when nothing moved or --dry-run
  written: boolean;
  limitBytes: number;
  beforeBytes: number;
  afterBytes: number;
  entriesMoved: number;
  archive: string;
  backup: string;
}
