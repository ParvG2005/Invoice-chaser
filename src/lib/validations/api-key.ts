import { z } from "zod";

export const createApiKeySchema = z.object({ name: z.string().min(1).max(60) });
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
