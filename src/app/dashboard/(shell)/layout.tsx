import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white dark:bg-zinc-950">
      <div className="hidden md:flex">
        <AppSidebar />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-7xl flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
