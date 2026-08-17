'use client';

import { useEffect } from 'react';

// FR-9: for an Active Trip, the Timeline auto-positions to today without
// requiring manual navigation, on every load (not just first mount of the
// session) -- there's no client-side state to gate this on, so it always
// runs when this component is on the page.
export function TimelineAutoScroll({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    el?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
  }, [targetId]);

  return null;
}
