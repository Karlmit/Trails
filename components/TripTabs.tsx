'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// spec-guest-access: a Guest only ever sees the three tabs whose routes are
// actually allowlisted in proxy.ts's GUEST_ELIGIBLE_PATH (Overview,
// Timeline, Blog) -- every other tab links to a page that would redirect
// them to /login (unchanged behavior, spec's I/O matrix).
const GUEST_VISIBLE_LABELS = new Set(['Timeline', 'Blog', 'Overview']);

export function TripTabs({ tripId, viewer }: { tripId: string; viewer: 'user' | 'guest' }) {
  const pathname = usePathname();

  const allTabs = [
    { href: `/trips/${tripId}/timeline`, label: 'Timeline' },
    { href: `/trips/${tripId}/sections`, label: 'Sections' },
    { href: `/trips/${tripId}/ideas`, label: 'Ideas' },
    { href: `/trips/${tripId}/checklists`, label: 'Checklists' },
    { href: `/trips/${tripId}/important-info`, label: 'Important Info' },
    { href: `/trips/${tripId}/blog`, label: 'Blog' },
    { href: `/trips/${tripId}/budget`, label: 'Budget' },
    { href: `/trips/${tripId}/documents`, label: 'Documents' },
    { href: `/trips/${tripId}/overview`, label: 'Overview' },
  ];

  const tabs = viewer === 'guest' ? allTabs.filter((tab) => GUEST_VISIBLE_LABELS.has(tab.label)) : allTabs;

  return (
    <nav className="trip-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`trip-tab${pathname === tab.href ? ' active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
