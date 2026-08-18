'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// FR-30, spec-admin-users: `role` is optional/omittable by any existing
// caller (defaults to `null`, same as a logged-out `username`) -- the
// "Admin" link only renders for `role === 'ADMIN'`, never for a `USER` or
// logged-out visitor.
export function TopNav({ username, role = null }: { username: string | null; role?: string | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/v1/auth', { method: 'DELETE' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <header className="top-nav">
      <Link href="/" className="top-nav-brand">
        <Image src="/logo.png" alt="" width={32} height={32} priority />
        Trails
      </Link>
      {username && (
        <div className="top-nav-actions">
          <Link href="/trips" className="text-soft">
            Trips
          </Link>
          {role === 'ADMIN' && (
            <Link href="/admin/users" className="text-soft">
              Admin
            </Link>
          )}
          <span className="text-soft">{username}</span>
          <button
            type="button"
            className="btn btn-dark-outline"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </header>
  );
}
