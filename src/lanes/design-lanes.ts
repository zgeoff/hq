interface DesignLaneView {
  // Open design runs in the lane, and how many pacing.json allows.
  open: number;
  slots: number;

  // The issues the lane takes next, in focus order; one per free lane, and for the with-geoff lane the
  // next one even when it is full (it then waits for the lane).
  next: string[];
}

// The 3 design lanes beside the delivery pool: 2 agent passes and the with-geoff pass, by default.
export interface DesignLanes {
  agent: DesignLaneView;
  withGeoff: DesignLaneView & {
    // Where the owner asked for each open pass above the lane count; empty while the lane is not over.
    asked: string[];
  };
}
