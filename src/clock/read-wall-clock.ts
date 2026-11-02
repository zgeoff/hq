// Never HQ_NOW for a write that changes who may do what: the caller sets it, and a pinned future
// time would end the owner's cap so z-delivery could raise it.
export function readWallClock(): Date {
  return new Date();
}
