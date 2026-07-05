"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ReceiptText,
  Users,
  Package,
  Wallet,
  Upload,
  BellRing,
  Settings,
  BarChart3,
  Bot,
  Zap,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { UserButton, useClerk } from "@clerk/nextjs";

export const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/bills", label: "Bills", icon: ReceiptText },
  { href: "/dashboard/parties", label: "Parties", icon: Users },
  { href: "/dashboard/stock", label: "Stock", icon: Package },
  { href: "/dashboard/payments", label: "Payments", icon: Wallet },
  { href: "/dashboard/imports", label: "Imports", icon: Upload },
  { href: "/dashboard/reminders", label: "Reminders", icon: BellRing },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export const comingSoonLinks = [
  { label: "Assistant", icon: Bot },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { signOut } = useClerk();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
        <Zap className="h-6 w-6 text-emerald-500" />
        <span className="text-lg font-bold tracking-tight">InvoicePilot</span>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto p-4">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        <div className="pt-4">
          <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Coming soon
          </span>
        </div>
        {comingSoonLinks.map(({ label, icon: Icon }) => (
          <div
            key={label}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 opacity-60 dark:text-zinc-600"
          >
            <span className="flex items-center gap-3">
              <Icon className="h-4 w-4" />
              {label}
            </span>
            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Soon
            </span>
          </div>
        ))}
      </nav>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <UserButton />
        </div>
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
