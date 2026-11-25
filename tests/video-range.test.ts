import { describe, expect, it } from 'vitest';
import { videoByteRange } from '@/lib/video-range';

describe('blog video byte ranges', () => {
  it('handles initial, open-ended and suffix reads', () => {
    expect(videoByteRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
    expect(videoByteRange('bytes=40-', 100)).toEqual({ start: 40, end: 99 });
    expect(videoByteRange('bytes=-25', 100)).toEqual({ start: 75, end: 99 });
    expect(videoByteRange('bytes=40-500', 100)).toEqual({ start: 40, end: 99 });
  });

  it('rejects unsatisfiable and unsupported ranges', () => {
    for (const invalid of ['bytes=100-', 'bytes=30-12', 'bytes=-0', 'bytes=0-1,20-25', 'banana']) {
      expect(videoByteRange(invalid, 100)).toBeNull();
    }
  });
});
