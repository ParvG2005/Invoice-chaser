import type { EmailTone } from "@prisma/client";

export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  latencyMs: number;
}

export interface ReminderEmailContext {
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  tone: EmailTone;
  senderName: string;
  organizationName: string;
  notes?: string | null;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
