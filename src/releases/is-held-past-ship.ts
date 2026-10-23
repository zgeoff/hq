// A hold set at or after every ship time hq found says those releases do not make the run live, so
// the ship pass leaves the run to whoever holds it. A hold from before the release still ships.
export function isHeldPastShip(heldAt: string | null, shippedAt: readonly string[]): boolean {
  if (heldAt === null) {
    return false;
  }
  const held = Date.parse(heldAt);
  return shippedAt.every((at) => Date.parse(at) <= held);
}
