'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const NAV = [
  { href: '/dashboard',    label: 'Dashboard',    icon: '▦' },
  { href: '/users',        label: 'Users',         icon: '👤' },
  { href: '/applications', label: 'Applications',  icon: '📋' },
  { href: '/redemptions',  label: 'Redemptions',   icon: '↩' },
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
        <div style={{ color: 'var(--forest)', fontSize: 15, fontWeight: 500 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{ width: 'var(--sidebar-width)', background: 'var(--forest)', color: 'white' }}
      >
        {/* Brand */}
        <div style={{
          padding: '26px 20px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{
            fontSize: 9.5,
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Admin Portal
          </div>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 19,
            fontWeight: 600,
            color: '#ffffff',
            lineHeight: 1.25,
            letterSpacing: '0.02em',
          }}>
            DHANANI
          </div>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--sage)',
            marginTop: 2,
          }}>
            Private Equity Group
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '14px 12px' }}>
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${pathname.startsWith(href) ? 'active' : ''}`}
            >
              <span style={{ fontSize: 15, width: 20, flexShrink: 0 }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div style={{
          padding: '14px 20px 18px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginBottom: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Signed in as
          </div>
          <div style={{ fontSize: 13.5, color: '#ffffff', fontWeight: 600, marginBottom: 10 }}>
            {user.firstName} {user.lastName}
          </div>
          <button
            onClick={() => { logout(); router.push('/login'); }}
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.45)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              letterSpacing: '0.01em',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────── */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--bg-page)' }}>
        {children}
      </main>

    </div>
  );
}
