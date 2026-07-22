import { Eye } from "lucide-react";

/**
 * Thin banner shown at the top of the dashboard when the interviewer is in the
 * shared demo session. Signals that outbound email/reminder sends are disabled.
 */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <Eye className="h-3.5 w-3.5" />
      Demo mode — explore freely. Real emails and reminder sends are disabled.
    </div>
  );
}
