export const cursorIndex = (c: string): number => {
  try {
    const wire: unknown = JSON.parse(Buffer.from(c, 'base64url').toString());
    return Array.isArray(wire) && wire[0] === 'events' && typeof wire[1] === 'number' ? wire[1] : NaN;
  } catch {
    return NaN;
  }
};
