'use client';

import { useEffect, useRef } from 'react';

export function BlogViewTracker({ entryId }: { entryId: string }) {
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    function recordWhenVisible() {
      if (document.visibilityState !== 'visible' || recorded.current === entryId) return;
      recorded.current = entryId;
      void fetch(`/api/v1/timeline-entries/${entryId}/views`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {});
    }

    recordWhenVisible();
    document.addEventListener('visibilitychange', recordWhenVisible);
    return () => document.removeEventListener('visibilitychange', recordWhenVisible);
  }, [entryId]);
  return null;
}
