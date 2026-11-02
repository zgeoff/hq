import type { BandSegment as BandSegmentContract, PaneDetail, PaneHeatRow as PaneHeatRowContract } from '../../mods/hq-band/types';

type BandTone = 'ok' | 'warn' | 'alert';

// Each extends the band mod's own contract, so a change hq makes that the mod can't draw fails
// hq's typecheck.
export interface BandSegment extends BandSegmentContract {
  key: 'needs' | 'nix' | 'lanes' | 'ci' | 'reviews';
  tone: BandTone;
}

export interface Band {
  at: string;
  segments: BandSegment[];
  line: string;
}

export type PaneHeatRow = PaneHeatRowContract;

export interface Pane extends PaneDetail {
  at: string;
}
