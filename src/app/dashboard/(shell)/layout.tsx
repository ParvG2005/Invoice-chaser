import { auth } from "@clerk/nextjs/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { AssistantDrawer } from "@/components/assistant/AssistantDrawer";
import { DemoBanner } from "@/components/demo/demo-banner";
import { isDemoClerkUser } from "@/lib/demo";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  const demo = await isDemoClerkUser(userId);

  return (
    <div className="flex min-h-screen bg-white dark:bg-zinc-950">
      <div className="hidden md:flex">
        <AppSidebar />
      </div>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {demo ? <DemoBanner /> : null}
        <TopBar />
        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 overflow-auto p-6">{children}</main>
      </div>
      <AssistantDrawer />
    </div>
  );
}
