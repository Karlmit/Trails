'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

// spec-guest-access: a Guest only ever sees the three tabs whose routes are
// actually allowlisted in proxy.ts's GUEST_ELIGIBLE_PATH (Overview,
// Timeline, Blog) -- every other tab links to a page that would redirect
// them to /login (unchanged behavior, spec's I/O matrix). Keyed on a
// stable, untranslated tab id rather than its (locale-dependent) display
// label.
const GUEST_VISIBLE_KEYS = new Set(['timeline', 'blog', 'overview']);

// User-reported: "Some menues scroll wierdly to the sides... hamburger
// menus are prefered over side scrolling." Nine tabs never fit a phone
// width, so this used `overflow-x: auto` as its mobile fallback -- a
// sideways-scrolling nav bar with no visual hint more of it exists off
// to the right. Below 640px that row is replaced by a single button
// showing the current tab, opening a dropdown list of every tab instead;
// above it, the original horizontal row (unchanged) still renders --
// both variants are always in the DOM and CSS alone decides which is
// visible, same approach as TopNav.tsx's own mobile menu.
export function TripTabs({ tripId, viewer }: { tripId: string; viewer: 'user' | 'guest' }) {
  const t = useTranslations('tripShell');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const allTabs = [
    { href: `/trips/${tripId}/timeline`, key: 'timeline', label: t('tabTimeline') },
    { href: `/trips/${tripId}/sections`, key: 'sections', label: t('tabSections') },
    { href: `/trips/${tripId}/ideas`, key: 'ideas', label: t('tabIdeas') },
    { href: `/trips/${tripId}/checklists`, key: 'checklists', label: t('tabChecklists') },
    { href: `/trips/${tripId}/important-info`, key: 'importantInfo', label: t('tabImportantInfo') },
    { href: `/trips/${tripId}/blog`, key: 'blog', label: t('tabBlog') },
    { href: `/trips/${tripId}/budget`, key: 'budget', label: t('tabBudget') },
    { href: `/trips/${tripId}/documents`, key: 'documents', label: t('tabDocuments') },
    { href: `/trips/${tripId}/overview`, key: 'overview', label: t('tabOverview') },
  ];

  const tabs = viewer === 'guest' ? allTabs.filter((tab) => GUEST_VISIBLE_KEYS.has(tab.key)) : allTabs;
  const activeTab = tabs.find((tab) => tab.href === pathname);

  return (
    <div className="trip-tabs-wrap">
      <nav className="trip-tabs trip-tabs-desktop">
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

      <button
        type="button"
        className="trip-tabs-menu-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span aria-hidden="true">☰</span> {activeTab?.label ?? t('menu')}
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <nav className="trip-tabs-mobile-panel">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`trip-tabs-mobile-link${pathname === tab.href ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
