export function isHeldPastShip(heldAt: string | null, shippedAt: readonly string[]): boolean {
  if (heldAt === null) {
    return false;
  }
  const held = Date.parse(heldAt);
  return shippedAt.every((at) => Date.parse(at) <= held);
}
