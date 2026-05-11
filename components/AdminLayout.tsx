'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/users', label: 'Users', icon: '👤' },
  { href: '/applications', label: 'Applications', icon: '📋' },
  { href: '/redemptions', label: 'Redemptions', icon: '↩' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f6f9' }}>
        <div style={{ color: '#0f2342', fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{ width: 240, background: '#0f2342', color: 'white' }}
      >
        {/* Logo */}
        <div style={{ padding: '28px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Admin Portal
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#b8923a', lineHeight: 1.2 }}>
            DPEG<br /><span style={{ color: 'white', fontWeight: 400 }}>Real Estate Fund</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3" style={{ paddingTop: 16 }}>
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${pathname.startsWith(href) ? 'active' : ''}`}
            >
              <span style={{ fontSize: 16, width: 20 }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Signed in as</div>
          <div style={{ fontSize: 14, color: 'white', fontWeight: 600, marginBottom: 12 }}>
            {user.firstName} {user.lastName}
          </div>
          <button
            onClick={() => { logout(); router.push('/login'); }}
            style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto" style={{ background: '#f4f6f9' }}>
        {children}
      </main>
    </div>
  );
}
