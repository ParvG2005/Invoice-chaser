"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch<{ apiKeys: ApiKey[] }>("/api/settings/api-keys"),
  });
  const keys = data?.apiKeys ?? [];

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ apiKey: ApiKey; secret: string }>("/api/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (res) => {
      setSecret(res.secret);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create key"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/settings/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Key revoked");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke key"),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-zinc-500" />
          <CardTitle>API Keys</CardTitle>
        </div>
        <CardDescription>
          Used by the Tally sync agent to import data. Treat a key like a password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {secret && (
          <div className="rounded-lg border border-emerald-500 bg-emerald-50 p-3 dark:bg-emerald-950">
            <p className="text-sm font-medium">Copy this key now — you won&apos;t see it again:</p>
            <code className="mt-1 block break-all text-sm">{secret}</code>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                void navigator.clipboard.writeText(secret);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="api-key-name">New key name</Label>
          <div className="flex gap-2">
            <Input
              id="api-key-name"
              placeholder="Office PC agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Creating..." : "Create key"}
            </Button>
          </div>
        </div>

        {keys.length > 0 && (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{k.name}</span>{" "}
                  <code className="text-zinc-500">{k.prefix}…</code>
                  {k.revokedAt && <span className="ml-2 text-red-500">revoked</span>}
                </span>
                {!k.revokedAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(k.id)}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
