import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Mail, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-xl font-bold">InvoicePilot</div>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button>Get started</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard">
              <Button>
                Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </Show>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <Sparkles className="h-4 w-4" /> AI-powered invoice chasing
        </p>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Get paid faster with automated, polite reminders
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Upload invoices, configure reminder sequences, and let InvoicePilot send professional
          follow-ups — powered by free-tier AI models.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button size="lg">Start free</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard">
              <Button size="lg">Open dashboard</Button>
            </Link>
          </Show>
        </div>

        <div className="mt-20 grid gap-6 text-left sm:grid-cols-3">
          {[
            {
              icon: Mail,
              title: "Smart reminders",
              desc: "AI drafts friendly, professional, or firm emails tailored to each invoice.",
            },
            {
              icon: Timer,
              title: "Automated sequences",
              desc: "Set reminder days and auto-send — we detect overdue invoices for you.",
            },
            {
              icon: Sparkles,
              title: "Recovery dashboard",
              desc: "Track unpaid totals, overdue counts, and payments recovered at a glance.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <Icon className="mb-4 h-8 w-8 text-emerald-500" />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
