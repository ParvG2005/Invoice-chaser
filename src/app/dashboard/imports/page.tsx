"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BatchList } from "@/modules/imports/components/batch-list";
import { ImportWizard } from "@/modules/imports/components/import-wizard";
import { BatchDetail } from "@/modules/imports/components/batch-detail";

export default function ImportsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Imports</h1>
          <p className="text-zinc-500">Import parties, stock items, and vouchers from TallyPrime XML exports.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          New import
        </Button>
      </div>

      <BatchList onSelect={setSelectedBatchId} />

      {wizardOpen && <ImportWizard onClose={() => setWizardOpen(false)} />}
      {selectedBatchId && (
        <BatchDetail batchId={selectedBatchId} onClose={() => setSelectedBatchId(null)} />
      )}
    </div>
  );
}
