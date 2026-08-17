import type { Metadata } from 'next';
import { appFont } from '@/app/fonts';
import { getSessionUser } from '@/lib/auth';
import { TopNav } from '@/components/TopNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trails',
  description: 'Trails — trip planning and travel journal.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en" className={appFont.variable}>
      <body>
        <TopNav username={user?.username ?? null} />
        {children}
      </body>
    </html>
  );
}
