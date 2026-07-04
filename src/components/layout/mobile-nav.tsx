"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { navLinks, comingSoonLinks } from "@/components/layout/app-sidebar";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-zinc-200 dark:border-zinc-800">
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-emerald-500" />
            <span className="text-lg font-bold tracking-tight">InvoicePilot</span>
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto p-4">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
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
      </SheetContent>
    </Sheet>
  );
}
