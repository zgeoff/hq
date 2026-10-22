import type { BandSegment as BandSegmentContract, PaneDetail, PaneHeatRow as PaneHeatRowContract } from '../../mods/hq-band/types';

// How a band segment is drawn: plain when all is well, amber near a limit or when hq can't tell,
// red when something needs the owner or is down.
type BandTone = 'ok' | 'warn' | 'alert';

// Each extends the band mod's own contract, so a change hq makes that the mod can't draw fails
// hq's typecheck.
export interface BandSegment extends BandSegmentContract {
  key: 'needs' | 'nix' | 'lanes' | 'ci' | 'reviews';
  tone: BandTone;
}

// The fleet in one line, for the band above z-stu's prompt.
export interface Band {
  at: string;
  segments: BandSegment[];
  line: string;
}

// One lane of the pane's heat map: a cell per slot, the first `used` of them held. `used` is the
// true count, so it can exceed `size`; the pane then names the runs over.
export type PaneHeatRow = PaneHeatRowContract;

// The /hq pane: its sections as Markdown, and the lanes the heat map draws above them.
export interface Pane extends PaneDetail {
  at: string;
}
