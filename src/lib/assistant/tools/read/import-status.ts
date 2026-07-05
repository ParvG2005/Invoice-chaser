import { z } from "zod";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  batchId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Disabled: the brief calls for `importService.getBatches(organizationId,
 * {...})`, but there is no `importService` module. The only import service
 * is `src/server/services/import/tally-import.service.ts`, exporting
 * `tallyImportService` with `listBatches(organizationId)` (no filter/limit
 * options) and `getBatch(organizationId, batchId)` (single batch, not a
 * filtered list). Neither matches the brief's `getBatches(org, { batchId,
 * limit })` contract closely enough to fake safely, so this tool is left
 * disabled pending a real decision on the intended shape (Task 4/5 follow-up).
 */
export const importStatus: ToolDefinition<z.infer<typeof schema>> = {
  name: "import_status",
  kind: "read",
  disabled: true,
  description: "Get the status of Tally import batches. Currently disabled — see source comment.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      batchId: { type: "string", description: "Filter to a single batch." },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows to return." },
    },
    additionalProperties: false,
  },
  summarize: (i) => (i.batchId ? `Get import status for batch ${i.batchId}` : "Get import status"),
  async execute() {
    return { ok: false, error: "import_status is disabled" };
  },
};
