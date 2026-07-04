import { NotFoundError } from "@/lib/api/errors";
import type { AdjustStockInput, RecordMovementInput } from "@/lib/validations/stock";
import { itemRepository } from "@/server/repositories/item.repository";
import { stockRepository } from "@/server/repositories/stock.repository";
import { toStockMovementDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";
import { decimalToNumber } from "@/lib/utils/currency";

export const stockService = {
  async recordMovement(
    organizationId: string,
    input: RecordMovementInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const item = await itemRepository.findById(organizationId, input.itemId);
    if (!item) throw new NotFoundError("Item not found");

    return withAudit(
      actor,
      "stock.recordMovement",
      { organizationId, entityType: "StockMovement" },
      async () => {
        const movement = await stockRepository.createMovement({
          organization: { connect: { id: organizationId } },
          item: { connect: { id: input.itemId } },
          qty: input.qty,
          rate: input.rate ?? null,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          godown: input.godown ?? null,
          notes: input.notes ?? null,
          ...(input.movementDate ? { movementDate: input.movementDate } : {}),
        });
        return toStockMovementDto(movement);
      },
    );
  },

  /**
   * Manual stock correction (Task 22 "Adjust stock" dialog) — a thin wrapper
   * over `recordMovement` that fixes `sourceType: "ADJUSTMENT"` and threads
   * the user-supplied reason through the movement's `notes` field.
   */
  async adjust(
    organizationId: string,
    itemId: string,
    input: AdjustStockInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    return this.recordMovement(
      organizationId,
      { itemId, qty: input.qty, sourceType: "ADJUSTMENT", notes: input.reason },
      actor,
    );
  },

  async getItemStock(organizationId: string, itemId: string) {
    const item = await itemRepository.findById(organizationId, itemId);
    if (!item) throw new NotFoundError("Item not found");
    const movementSum = await stockRepository.sumQty(organizationId, itemId);
    return { itemId, currentQty: decimalToNumber(item.openingQty) + movementSum };
  },

  /**
   * Batched stock-on-hand for a set of items (`openingQty + sum of
   * movements` per item), used by the item-picker search route
   * (`GET /api/items?query=`, Task 14) so the stock badge doesn't require an
   * N+1 `getItemStock` call per search result.
   */
  async getStockForItems(
    organizationId: string,
    items: Array<{ id: string; openingQty: number }>,
  ): Promise<Map<string, number>> {
    const movementSums = await stockRepository.sumQtyByItemIds(
      organizationId,
      items.map((item) => item.id),
    );
    return new Map(
      items.map((item) => [item.id, item.openingQty + (movementSums.get(item.id) ?? 0)]),
    );
  },

  async listMovements(
    organizationId: string,
    itemId: string,
    options: { take?: number; cursor?: string } = {},
  ) {
    const movements = await stockRepository.listMovements(organizationId, itemId, options);
    return movements.map(toStockMovementDto);
  },

  /**
   * Clears every movement previously recorded against a source document, so
   * a re-imported voucher (newer ALTERID) can have its stock effect
   * re-recorded from scratch instead of double-counting. No withAudit here —
   * this is an internal step of the import's own audited write, mirroring
   * the other simple stock read/write helpers above.
   */
  async replaceMovementsForSource(
    organizationId: string,
    sourceType: RecordMovementInput["sourceType"],
    sourceId: string,
  ) {
    await stockRepository.softDeleteMovementsForSource(organizationId, sourceType, sourceId);
  },
};
