import { z } from "zod";

export const createSessionSchema = z.object({
  title: z.string().max(200).optional(),
  modelTier: z.enum(["default", "tier"]).optional(),
});

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(8000),
  contextChip: z.string().max(2000).optional(),
});

export const rejectActionSchema = z.object({
  feedback: z.string().min(1).max(1000),
});

export const batchApproveSchema = z.object({
  actionIds: z.array(z.string().min(1)).min(1).max(50),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type RejectActionInput = z.infer<typeof rejectActionSchema>;
export type BatchApproveInput = z.infer<typeof batchApproveSchema>;
