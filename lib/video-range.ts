/** Parses a single RFC 9110 byte range for a non-empty video. */
export function videoByteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size < 1) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < size && start <= end
    ? { start, end: Math.min(end, size - 1) }
    : null;
}
