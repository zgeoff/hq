// One segment of `hq band --json`: hq decides its text and tone, the band only draws it.
export interface BandSegment {
  key: string;
  text: string;
  tone: 'ok' | 'warn' | 'alert';
}

// The band's last read: hq's segments, or hq could not be read.
export type BandReading = { segments: BandSegment[] } | { unreachable: string };

// One lane of `hq pane --json`'s heat map: a cell per slot, the first `used` held. `used` can
// exceed `size`: the pane draws the slots, then the count over.
export interface PaneHeatRow {
  lane: string;
  size: number;
  used: number;
}

// What `hq pane --json` gives: the sections as Markdown, and the heat map's lanes.
export interface PaneDetail {
  markdown: string;
  heat: PaneHeatRow[];
}

// The /hq pane's last read: hq's detail, or hq could not be read.
export type PaneReading = PaneDetail | { unreachable: string };

declare module 'claude-code' {
  interface PluginState {
    'hq-band': { live: boolean; reading: BandReading | null; pane: PaneReading | null };
  }
}
