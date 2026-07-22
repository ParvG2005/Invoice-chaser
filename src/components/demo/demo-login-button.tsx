"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "View live demo" button. Fetches a Clerk sign-in ticket from
 * /api/demo-login, signs the interviewer in as the shared demo account
 * (SignInFuture ticket flow), and redirects to the dashboard. Render only when
 * demo mode is configured.
 */
export function DemoLoginButton({
  className,
  size,
  variant,
}: Pick<React.ComponentProps<typeof Button>, "className" | "size" | "variant">) {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDemo() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-login", { method: "POST" });
      if (!res.ok) throw new Error("Demo unavailable right now");
      const { ticket } = (await res.json()) as { ticket: string };

      const { error: ticketErr } = await signIn.ticket({ ticket });
      if (ticketErr) throw new Error("Sign-in failed");

      const { error: finalizeErr } = await signIn.finalize();
      if (finalizeErr) throw new Error("Sign-in failed");

      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        onClick={startDemo}
        disabled={loading}
        className={className}
        size={size}
        variant={variant}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        View live demo
      </Button>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}
