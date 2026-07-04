import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const STOCK_MOVEMENT_PAGE_SIZE = 100;
export const STOCK_MOVEMENT_MAX_PAGE_SIZE = 500;

export const stockRepository = {
  createMovement(data: Prisma.StockMovementCreateInput) {
    return prisma.stockMovement.create({ data });
  },

  listMovements(
    organizationId: string,
    itemId: string,
    options: { take?: number; cursor?: string } = {},
  ) {
    const take = Math.min(options.take ?? STOCK_MOVEMENT_PAGE_SIZE, STOCK_MOVEMENT_MAX_PAGE_SIZE);
    return prisma.stockMovement.findMany({
      where: { organizationId, itemId, deletedAt: null },
      orderBy: [{ movementDate: "desc" }, { id: "desc" }],
      take,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  async sumQty(organizationId: string, itemId: string): Promise<number> {
    const result = await prisma.stockMovement.aggregate({
      where: { organizationId, itemId, deletedAt: null },
      _sum: { qty: true },
    });
    return result._sum.qty ? Number(result._sum.qty) : 0;
  },
};
