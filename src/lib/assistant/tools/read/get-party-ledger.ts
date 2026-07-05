import { z } from "zod";
import { partyService } from "@/server/services/party.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({ partyId: z.string().min(1) });

export const getPartyLedger: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_party_ledger",
  kind: "read",
  description:
    "Fetch a party's chronological statement (invoices/bills/payments with running balance).",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { partyId: { type: "string", description: "The party id." } },
    required: ["partyId"],
    additionalProperties: false,
  },
  summarize: (i) => `Get ledger for party ${i.partyId}`,
  async execute(ctx, input) {
    // Actual service method is `ledger`, not `getLedger` — verified against
    // src/server/services/party.service.ts. Ledger rows carry no free-text
    // fields (date/docType/docNumber/debit/credit/balance/currency), so no
    // wrapUntrusted is needed here.
    const rows = await partyService.ledger(ctx.organizationId, input.partyId);
    return { ok: true, data: rows };
  },
};
