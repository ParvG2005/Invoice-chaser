"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { InvoiceTable } from "@/modules/invoices/components/invoice-table";
import { CreateInvoiceDialog } from "@/modules/invoices/components/create-invoice-dialog";
import { ImportDialog } from "@/modules/invoices/components/import-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Send, X } from "lucide-react";
import type { GenerateEmailResult, InvoiceDto } from "@/types";

const PAGE_SIZE = 50;

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<(GenerateEmailResult & { invoiceId: string }) | null>(
    null,
  );
  const [previewTab, setPreviewTab] = useState<"email" | "whatsapp">("email");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["invoices"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<InvoiceDto[]>(
        `/api/invoices?limit=${PAGE_SIZE}${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    // A full page implies there may be more; the last invoice id is the next cursor.
    getNextPageParam: (lastPage) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].id : undefined,
  });

  const invoices = data?.pages.flat() ?? [];

  const markPaid = useMutation({
    mutationFn: (id: string) =>
      apiFetch<InvoiceDto>(`/api/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PAID" }),
      }),
    onSuccess: () => {
      toast.success("Invoice marked as paid");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateEmail = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<GenerateEmailResult>("/api/ai/generate-email", {
        method: "POST",
        body: JSON.stringify({ invoiceId }),
      }).then((res) => ({ ...res, invoiceId })),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewTab("email");
      toast.success("Reminder generated — review and dispatch below");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setLoadingId(null),
  });

  const sendEmail = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("No email to send");
      return apiFetch<{ sent: boolean; whatsappSent: boolean; messageId: string }>(
        "/api/ai/send-email",
        {
          method: "POST",
          body: JSON.stringify({
            invoiceId: preview.invoiceId,
            subject: preview.subject,
            bodyHtml: preview.bodyHtml,
            bodyText: preview.bodyText,
            whatsappText: preview.whatsappText,
          }),
        },
      );
    },
    onSuccess: (res) => {
      if (res.whatsappSent) {
        toast.success("Email and WhatsApp reminders dispatched successfully!");
      } else {
        toast.success("Email reminder dispatched successfully!");
      }
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(`Failed to send: ${e.message}`),
  });

  const deleteInvoice = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Invoice deleted");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setDeletingId(null),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-zinc-500">Manage clients, track status, and generate AI reminders.</p>
        </div>
        <div className="flex gap-2">
          <ImportDialog />
          <CreateInvoiceDialog />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <InvoiceTable
          invoices={invoices}
          loadingId={loadingId}
          deletingId={deletingId}
          onMarkPaid={(id) => markPaid.mutate(id)}
          onGenerateEmail={(id) => {
            setLoadingId(id);
            generateEmail.mutate(id);
          }}
          onDelete={(id) => {
            setDeletingId(id);
            deleteInvoice.mutate(id);
          }}
        />
      )}
      {!isLoading && hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
      {/* AI Preview Modal */}
      {preview &&
        (() => {
          const selectedInvoice = invoices.find((inv) => inv.id === preview.invoiceId);
          const clientPhone = selectedInvoice?.clientPhone;
          const waUrl =
            clientPhone && preview.whatsappText
              ? `https://api.whatsapp.com/send?phone=${encodeURIComponent(clientPhone)}&text=${encodeURIComponent(preview.whatsappText)}`
              : null;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 animate-in fade-in zoom-in duration-200">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      AI Reminder Drafts
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {previewTab === "email" ? preview.subject : "WhatsApp Notification Draft"}
                    </h3>
                  </div>
                  <button
                    onClick={() => setPreview(null)}
                    className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Tabs Selector */}
                <div className="flex border-b border-zinc-100 px-6 pt-2 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <button
                    onClick={() => setPreviewTab("email")}
                    className={`border-b-2 px-4 py-2 text-sm font-semibold transition-all ${
                      previewTab === "email"
                        ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    }`}
                  >
                    Email Template
                  </button>
                  {preview.whatsappText && (
                    <button
                      onClick={() => setPreviewTab("whatsapp")}
                      className={`border-b-2 px-4 py-2 text-sm font-semibold transition-all ${
                        previewTab === "whatsapp"
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      }`}
                    >
                      WhatsApp Message
                    </button>
                  )}
                </div>

                {/* Modal Body */}
                <div className="px-6 py-5 overflow-y-auto flex-1 min-h-[250px]">
                  {previewTab === "email" ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
                    />
                  ) : (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/30 max-w-md mx-auto relative shadow-sm">
                      {/* Mock WhatsApp Bubble */}
                      <div className="absolute top-2 left-4 text-[10px] text-zinc-400 font-medium">
                        WhatsApp Notification Preview
                      </div>
                      <div className="mt-4 bg-[#E2F9D3] dark:bg-emerald-950/40 text-zinc-900 dark:text-zinc-100 p-3.5 rounded-lg rounded-tl-none shadow-sm text-sm whitespace-pre-wrap leading-relaxed relative">
                        {preview.whatsappText}
                        <div className="text-[9px] text-right text-zinc-400 mt-1">
                          {new Date().toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
                  <p className="text-xs text-zinc-400">
                    Dispatches standard email{" "}
                    {preview.whatsappText ? "and companion WhatsApp reminder" : ""}.
                  </p>
                  <div className="flex gap-3">
                    {waUrl && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(waUrl, "_blank")}
                        className="gap-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                      >
                        Send via WhatsApp Web
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setPreview(null)}
                      disabled={sendEmail.isPending}
                    >
                      Close
                    </Button>
                    <Button
                      onClick={() => sendEmail.mutate()}
                      disabled={sendEmail.isPending}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {sendEmail.isPending ? "Sending..." : "Dispatch Now"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
