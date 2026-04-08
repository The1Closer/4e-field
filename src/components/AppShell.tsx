"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DebugBanner } from "@/components/DebugBanner";
import ThemeToggle from "@/components/ThemeToggle";
import type { UserRole } from "@/types/models";

type Props = {
  role: UserRole | null;
  onSignOut: () => Promise<void>;
  debug?: {
    userId: string | null;
    role: UserRole | null;
    accessToken: string | null;
    authError: string | null;
  };
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/jobs", label: "Home" },
  { href: "/knocking", label: "Knocking" },
  { href: "/knocking/doors", label: "Doors Map" },
  { href: "/tasks", label: "Tasks" },
  { href: "/notifications", label: "Notifications" },
];

const MOBILE_PRIMARY_HREFS = ["/jobs", "/knocking", "/tasks", "/notifications"];
const SHOW_DEBUG_BANNER = process.env.NEXT_PUBLIC_SHOW_DEBUG_BANNER === "true";

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLabel(role: UserRole | null) {
  if (!role) return "unknown";
  return role.replaceAll("_", " ");
}

export function AppShell({ role, onSignOut, debug, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const managerLike =
    role === "admin" ||
    role === "manager" ||
    role === "sales_manager" ||
    role === "production_manager" ||
    role === "social_media_coordinator";

  const items = useMemo(
    () => (managerLike ? [...navItems, { href: "/knocking/live", label: "Management" }] : navItems),
    [managerLike],
  );

  const mobileItems = useMemo(() => {
    const selected: NavItem[] = [];

    for (const href of MOBILE_PRIMARY_HREFS) {
      const match = items.find((item) => item.href === href);
      if (match) selected.push(match);
    }

    if (selected.length < 4) {
      for (const item of items) {
        if (selected.length >= 4) break;
        if (selected.some((entry) => entry.href === item.href)) continue;
        selected.push(item);
      }
    }

    return selected.slice(0, 4);
  }, [items]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="app-shell">
      <div className="shell-bg-layer shell-bg-primary" />
      <div className="shell-bg-layer shell-bg-secondary" />

      <header className="shell-header">
        <div className="layout shell-header-inner">
          <div className="shell-brand-wrap">
            <button
              type="button"
              className="secondary icon-btn menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <span className="menu-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>

            <Link href="/jobs" className="shell-brand">
              <span className="shell-brand-mark">
                <Image
                  src="/4ELogo.png"
                  alt="CRM logo"
                  width={38}
                  height={38}
                  className="shell-brand-logo"
                  priority
                />
              </span>
              <span className="shell-brand-text">
                <strong>Field</strong>
                <span className="muted">Role: {roleLabel(role)}</span>
              </span>
            </Link>
          </div>

          <div className="shell-actions">
            <ThemeToggle />
            <button
              className="secondary"
              onClick={async () => {
                await onSignOut();
                router.replace("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="layout desktop-only">
          <nav className="tabs tabs-desktop">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isNavItemActive(pathname, item.href) ? "tab tab-active" : "tab"}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <aside className={menuOpen ? "shell-drawer shell-drawer-open" : "shell-drawer"} aria-hidden={!menuOpen}>
        <div className="shell-drawer-inner">
          <div className="row">
            <h3 style={{ margin: 0 }}>Menu</h3>
            <button
              type="button"
              className="secondary icon-btn"
              onClick={() => setMenuOpen(false)}
              aria-label="Close navigation"
            >
              X
            </button>
          </div>
          <p className="hint">Field workflows and reporting.</p>

          <nav className="shell-drawer-nav">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isNavItemActive(pathname, item.href) ? "drawer-link drawer-link-active" : "drawer-link"}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {menuOpen ? (
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="shell-overlay"
          aria-label="Close navigation overlay"
        />
      ) : null}

      <main className="layout shell-main">
        {SHOW_DEBUG_BANNER && debug ? (
          <DebugBanner
            userId={debug.userId}
            role={debug.role}
            accessToken={debug.accessToken}
            authError={debug.authError}
          />
        ) : null}

        <section className="content">{children}</section>
      </main>

      <nav className="shell-mobile-nav" aria-label="Primary mobile navigation">
        <div className="shell-mobile-grid">
          {mobileItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isNavItemActive(pathname, item.href) ? "mobile-link mobile-link-active" : "mobile-link"}
            >
              <span>{item.label}</span>
            </Link>
          ))}

          <button type="button" className="mobile-link" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
