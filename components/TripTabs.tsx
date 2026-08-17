'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/trips/${tripId}/timeline`, label: 'Timeline' },
    { href: `/trips/${tripId}/sections`, label: 'Sections' },
    { href: `/trips/${tripId}/ideas`, label: 'Ideas' },
    { href: `/trips/${tripId}/blog`, label: 'Blog' },
    { href: `/trips/${tripId}/overview`, label: 'Overview' },
  ];

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
