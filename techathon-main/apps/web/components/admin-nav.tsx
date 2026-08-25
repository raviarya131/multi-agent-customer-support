"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, LayoutGrid, LogOut, RefreshCw, ShieldAlert, SlidersHorizontal, ThumbsUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";

type Role = "admin" | "agent" | "user" | undefined;

const NAV: { href: string; label: string; icon: typeof LayoutGrid; roles: Exclude<Role, undefined>[] }[] = [
  { href: "/tickets", label: "Tickets", icon: LayoutGrid, roles: ["admin"] },
  { href: "/escalations", label: "Escalations", icon: ShieldAlert, roles: ["admin", "agent"] },
  { href: "/collaboration", label: "Team", icon: Users, roles: ["admin", "agent"] },
  { href: "/observability", label: "Observability", icon: Activity, roles: ["admin"] },
  { href: "/feedback", label: "Feedback", icon: ThumbsUp, roles: ["admin"] },
  { href: "/platform", label: "Platform", icon: SlidersHorizontal, roles: ["admin"] },
];

/**
 * Shared top bar for every admin/agent console page. Provides a consistent brand
 * mark, role-aware section tabs, an optional refresh action, notifications, and
 * sign-out — so the back-office feels like one product instead of scattered pages.
 */
export function AdminHeader({
  title,
  subtitle,
  role,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  subtitle?: string;
  role?: Role;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const tabs = NAV.filter((n) => (role ? n.roles.includes(role as "admin" | "agent") : true));

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-md shadow-primary/25">
          SE
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {/* Section tabs */}
      <nav className="ml-2 hidden items-center gap-1 md:flex">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
                (active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")
              }
            >
              <Icon className="size-3.5" /> {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        {children}
        {onRefresh && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onRefresh}>
            <RefreshCw className={"size-3.5 " + (refreshing ? "animate-spin" : "")} /> Refresh
          </Button>
        )}
        <ThemeToggle />
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Sign out"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
