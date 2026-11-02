interface DesignLaneView {
  open: number;
  slots: number;
  next: string[];
}

export interface DesignLanes {
  countsError: string | null;
  agent: DesignLaneView;
  withGeoff: DesignLaneView & {
    asked: string[];
  };
}
