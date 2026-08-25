import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser, isAdmin } from '@/lib/auth';
import { serializeUser } from '@/lib/serializers';
import { CreateUserForm } from '@/components/CreateUserForm';

// FR-30, spec-admin-users: Admin-only management page. proxy.ts's existing
// requireAuth catch-all already guarantees a valid session reaches this
// component (it is never touched by this spec) -- the extra Admin-only
// restriction is this page's own application-level role check on top of
// that, per the Code Map. A non-Admin User who navigates here directly
// (the nav link never renders for them, but the URL itself isn't a secret)
// gets a simple in-page message, not a raw 403 status page or `notFound()`
// (I/O matrix: this route's existence isn't a secret to an already-
// authenticated User, unlike Guest's 404-not-403 rule for a Trip's
// existence).
export default async function AdminUsersPage() {
  const user = await getSessionUser();
  const t = await getTranslations('admin');

  if (!isAdmin(user)) {
    return (
      <main className="page-wide">
        <h1>{t('noAccessTitle')}</h1>
        <div className="empty-state">
          <p>{t('noAccess')}</p>
        </div>
      </main>
    );
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });

  return (
    <main className="page-wide">
      <h1>{t('title')}</h1>

      <CreateUserForm />

      {users.length === 0 ? (
        <div className="empty-state">
          <p>{t('emptyState')}</p>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          {users.map((u) => {
            const serialized = serializeUser(u);
            return (
              <div key={serialized.id} className="card row-between">
                <div>
                  <strong>{serialized.username}</strong>
                  <p className="text-soft" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {t('created', { date: serialized.createdAt.slice(0, 10) })}
                  </p>
                </div>
                <span className="badge">{t(`role.${serialized.role}`)}</span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
