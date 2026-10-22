import { readBadFilingsLine } from './read-bad-filings-line.ts';
import { readIssuesLine } from './read-issues-line.ts';
import { readStaleLine } from './read-stale-line.ts';
import type { ThroughputReader } from './types.ts';

// The check-in's throughput lines, in the order they print. A new line is one more reader here.
export const THROUGHPUT_LINES: readonly ThroughputReader[] = [readIssuesLine, readBadFilingsLine, readStaleLine];
