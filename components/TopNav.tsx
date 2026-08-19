'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// User-reported: "Some content are overlapping. Some menues scroll wierdly
// to the sides... hamburger menus are prefered over side scrolling." The
// signed-in action row (Trips / Admin / username / Log out) has no wrap
// behavior at all, so on a narrow phone it simply overflowed the viewport
// (confirmed live: the "Log out" button rendered ~90px past the right
// edge, on every single page, since this header is global) -- that's what
// was silently forcing horizontal scroll site-wide. Below 640px it's now
// collapsed behind a hamburger button; the two variants render
// side-by-side always and CSS (not JS) decides which one is visible, so
// there's no hydration-dependent viewport detection and no layout shift.
// A Guest's own header (just the brand + one "Log in" pill) already fits
// at every width and is left untouched.
//
// User-reported: "Top banner should always dissappear when scrolling
// down... guests should not always see login button when scrolling down
// on phones since it takes unnecessary space." -- `.top-nav` is
// `position: sticky`; translating it off-screen on scroll-down (and back
// on scroll-up) reclaims that space without giving up the sticky
// re-appear-when-you-need-it behavior. Scoped to phone widths via
// `matchMedia` -- a sticky header taking a fixed sliver of a desktop
// viewport was never the reported problem.
// FR-30, spec-admin-users: `role` is optional/omittable by any existing
// caller (defaults to `null`, same as a logged-out `username`) -- the
// "Admin" link only renders for `role === 'ADMIN'`, never for a `USER` or
// logged-out visitor.
export function TopNav({ username, role = null }: { username: string | null; role?: string | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/v1/auth', { method: 'DELETE' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)');
    let lastY = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      if (mql.matches) {
        setMenuOpen(false);
        if (y > lastY && y > 72) setHidden(true);
        else if (y < lastY) setHidden(false);
      } else {
        setHidden(false);
      }
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={`top-nav-wrap${hidden ? ' is-hidden' : ''}`}>
      <header className="top-nav">
        <Link href="/" className="top-nav-brand">
          <Image src="/logo.png" alt="" width={32} height={32} priority />
          Trails
        </Link>
        {username ? (
          <>
            <div className="top-nav-actions top-nav-actions-desktop">
              <Link href="/trips" className="text-soft">
                Trips
              </Link>
              {role === 'ADMIN' && (
                <Link href="/admin/users" className="text-soft">
                  Admin
                </Link>
              )}
              <span className="text-soft">{username}</span>
              <button type="button" className="btn btn-dark-outline" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
            <button
              type="button"
              className="top-nav-menu-btn"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </>
        ) : (
          // A Guest sees this on every Guest-eligible page (root, and any
          // Trip page shared with them) -- the only way back to an actual
          // account without knowing to type /login manually. A single
          // action, so it never needed the hamburger treatment.
          <div className="top-nav-actions">
            <Link href="/login" className="btn btn-dark-outline">
              Log in
            </Link>
          </div>
        )}
      </header>
      {username && menuOpen && (
        <div className="top-nav-mobile-panel">
          <Link href="/trips" className="top-nav-mobile-link" onClick={() => setMenuOpen(false)}>
            Trips
          </Link>
          {role === 'ADMIN' && (
            <Link href="/admin/users" className="top-nav-mobile-link" onClick={() => setMenuOpen(false)}>
              Admin
            </Link>
          )}
          <div className="top-nav-mobile-username text-soft">Signed in as {username}</div>
          <button
            type="button"
            className="btn btn-dark-outline"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{ width: '100%' }}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
