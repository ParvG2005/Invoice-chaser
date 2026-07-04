"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Search, Sun, Moon, Laptop, Bell } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { navLinks } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function pageTitle(pathname: string) {
  const match = [...navLinks]
    .sort((a, b) => b.href.length - a.href.length)
    .find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));
  return match?.label ?? "Dashboard";
}

export function TopBar() {
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const title = pageTitle(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 md:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <div className="flex flex-col">
          <p className="text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-50">{title}</p>
          <span className="hidden text-[11px] text-zinc-500 dark:text-zinc-400 sm:block">
            Organizations <span aria-hidden="true">›</span> My Organization
          </span>
        </div>
      </div>

      <div className="hidden max-w-xl flex-1 md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search invoices, parties, or stock..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-800"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Toggle theme">
              <Sun className="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
              <Moon className="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTheme("light")}>
              <Sun className="h-4 w-4" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("dark")}>
              <Moon className="h-4 w-4" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("system")}>
              <Laptop className="h-4 w-4" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="ml-1 flex items-center">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
