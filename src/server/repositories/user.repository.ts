import { prisma } from "@/lib/db/prisma";

export const userRepository = {
  findByClerkId(clerkId: string) {
    return prisma.user.findFirst({
      where: { clerkId, deletedAt: null },
    });
  },

  create(data: { clerkId: string; email: string; name?: string | null }) {
    return prisma.user.create({ data });
  },

  upsertFromClerk(data: { clerkId: string; email: string; name?: string | null }) {
    return prisma.user.upsert({
      where: { clerkId: data.clerkId },
      create: data,
      update: { email: data.email, name: data.name },
    });
  },
};
