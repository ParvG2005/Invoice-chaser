import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/inngest/client";
import { inngestFunctions } from "@/server/workflows/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
