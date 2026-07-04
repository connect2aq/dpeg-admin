"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { adminApi } from "@/lib/api";
import Image from "next/image";

const NAV = [
  { href: "/executive-copilot", label: "Executive Copilot", icon: "💬" },
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/users", label: "Users", icon: "👤" },
  { href: "/applications", label: "Applications", icon: "📋" },
  { href: "/redemptions", label: "Redemptions", icon: "↩" },
  { href: "/distributions", label: "Distributions", icon: "$" },
  { href: "/capital-ledger", label: "Fund Capital Ledger", icon: "⊞" },
  { href: "/investor-statements", label: "Investor Statements", icon: "📄" },
  { href: "/statements", label: "Statements", icon: "≡" },
  { href: "/daily-interest", label: "Daily Interest", icon: "%" },
  { href: "/odoo-logs", label: "Odoo Logs", icon: "⇄" },
  { href: "/email-logs", label: "Email Logs", icon: "✉" },
  { href: "/docusign", label: "DocuSign", icon: "✍" },
  { href: "/audit-log", label: "Audit Log", icon: "🔍" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/historical-import", label: "Historical Import", icon: "⬆" },
  { href: "/smtp-test", label: "SMTP Test", icon: "✉" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, loading } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingBadge, setPendingBadge] = useState(0);

  const adminRole = user?.adminRole ?? 'SuperAdmin';

  useEffect(() => {
    if (!user) return;
    adminApi.getPendingCounts().then(r => {
      if (!r.success || !r.data) return;
      if (adminRole === 'Checker') setPendingBadge(r.data.pendingForChecker);
      else if (adminRole === 'Approver') setPendingBadge(r.data.checkedForApprover);
      else if (adminRole === 'SuperAdmin') setPendingBadge(r.data.pendingForChecker + r.data.checkedForApprover);
    }).catch(() => {});
  }, [user, adminRole]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-page)" }}
      >
        <div style={{ color: "var(--forest)", fontSize: 15, fontWeight: 500 }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile overlay — closes sidebar on tap */}
      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside
        className={`sidebar-nav flex-shrink-0 flex flex-col min-h-0${mobileOpen ? ' open' : ''}`}
        style={{
          width: "var(--sidebar-width)",
          background: "var(--forest)",
          color: "white",
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-4"
          style={{
            padding: "26px 20px 22px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* <div
            style={{
              fontSize: 9.5,
              color: "rgba(255,255,255,0.4)",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Admin Portal
          </div> */}

          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/dpeg_logo_white.png`}
            alt="DPEG Logo"
            width={200}
            height={200}
          />
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "14px 12px", overflowY: "auto", minHeight: 0 }}>
          {/* Pending Approvals — visible to Checker, Approver, SuperAdmin */}
          {adminRole !== 'Maker' && (
            <Link
              href="/pending-approvals"
              className={`sidebar-link ${pathname.startsWith('/pending-approvals') ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
              style={{ position: 'relative' }}
            >
              <span style={{ fontSize: 15, width: 20, flexShrink: 0 }}>⏳</span>
              Pending Approvals
              {pendingBadge > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#b8923a', color: 'white',
                  borderRadius: 10, fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center'
                }}>{pendingBadge}</span>
              )}
            </Link>
          )}
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${pathname.startsWith(href) ? "active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <span style={{ fontSize: 15, width: 20, flexShrink: 0 }}>
                {icon}
              </span>
              {label}
            </Link>
          ))}
          {adminRole === 'SuperAdmin' && process.env.NEXT_PUBLIC_HANGFIRE_URL && (
            <a
              href={process.env.NEXT_PUBLIC_HANGFIRE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-link"
              onClick={() => setMobileOpen(false)}
            >
              <span style={{ fontSize: 15, width: 20, flexShrink: 0 }}>⚙</span>
              Job Monitor
            </a>
          )}
        </nav>

        {/* User footer */}
        <div
          style={{
            padding: "14px 20px 18px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: "rgba(255,255,255,0.4)",
              marginBottom: 3,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Signed in as
          </div>
          <Link
            href={`/users/${user.userId}`}
            onClick={() => setMobileOpen(false)}
            title="View my account (change password, etc.)"
            style={{ textDecoration: "none", display: "block" }}
          >
            <div
              style={{
                fontSize: 13.5,
                color: "#ffffff",
                fontWeight: 600,
                marginBottom: 2,
              }}
            >
              {user.firstName} {user.lastName}
            </div>
            <div style={{ fontSize: 10.5, color: '#b8923a', fontWeight: 600, marginBottom: 8, letterSpacing: '0.04em' }}>
              {adminRole} · My Account
            </div>
          </Link>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              letterSpacing: "0.01em",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.8)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.45)")
            }
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────── */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--bg-page)" }}
      >
        {/* Mobile top bar — only visible below 768px */}
        <div className="mobile-topbar">
          <button
            className="hamburger-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--forest)' }}>DPEG Admin</span>
        </div>
        {children}
      </main>
    </div>
  );
}
