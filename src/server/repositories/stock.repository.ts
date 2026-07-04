import type { Prisma, StockSourceType } from "@/generated/prisma/client";
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
    // OPENING movements mirror `item.openingQty`; excluded here so callers
    // that add `openingQty + sumQty` don't double-count it.
    const result = await prisma.stockMovement.aggregate({
      where: { organizationId, itemId, deletedAt: null, sourceType: { not: "OPENING" } },
      _sum: { qty: true },
    });
    return result._sum.qty ? Number(result._sum.qty) : 0;
  },

  /**
   * Batched movement-qty sum for a set of items (the item-picker search
   * route, Task 14), avoiding the N+1 of calling `sumQty` per row. Returns a
   * map keyed by itemId; an item with no movements is simply absent from the
   * map (caller treats a missing key as 0).
   */
  async sumQtyByItemIds(organizationId: string, itemIds: string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const rows = await prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        organizationId,
        itemId: { in: itemIds },
        deletedAt: null,
        sourceType: { not: "OPENING" },
      },
      _sum: { qty: true },
    });
    return new Map(rows.map((row) => [row.itemId, row._sum.qty ? Number(row._sum.qty) : 0]));
  },

  /**
   * Soft-deletes every movement recorded against a given source document
   * (e.g. an Invoice or Bill being re-imported with a newer ALTERID). Used
   * by stockService.replaceMovementsForSource ahead of re-recording.
   */
  softDeleteMovementsForSource(organizationId: string, sourceType: StockSourceType, sourceId: string) {
    return prisma.stockMovement.updateMany({
      where: { organizationId, sourceType, sourceId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
