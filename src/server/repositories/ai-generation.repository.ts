import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const aiGenerationRepository = {
  create(data: Prisma.AiGenerationCreateInput) {
    return prisma.aiGeneration.create({ data });
  },
};
