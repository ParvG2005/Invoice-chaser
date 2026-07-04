import { ImportWizard } from "@/modules/imports/components/import-wizard";
import { BatchHistory } from "@/modules/imports/components/batch-history";

export default function ImportsPage() {
  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Imports</h1>
        <p className="text-zinc-500">
          Import parties, stock items, and vouchers from TallyPrime XML exports, or invoices from CSV.
        </p>
      </div>

      <ImportWizard />
      <BatchHistory />
    </div>
  );
}
