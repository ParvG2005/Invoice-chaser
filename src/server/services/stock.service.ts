import { NotFoundError } from "@/lib/api/errors";
import type { RecordMovementInput } from "@/lib/validations/stock";
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
          ...(input.movementDate ? { movementDate: input.movementDate } : {}),
        });
        return toStockMovementDto(movement);
      },
    );
  },

  async getItemStock(organizationId: string, itemId: string) {
    const item = await itemRepository.findById(organizationId, itemId);
    if (!item) throw new NotFoundError("Item not found");
    const movementSum = await stockRepository.sumQty(organizationId, itemId);
    return { itemId, currentQty: decimalToNumber(item.openingQty) + movementSum };
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
