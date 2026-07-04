import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreateItemInput, UpdateItemInput } from "@/lib/validations/item";
import { itemRepository, type ItemListOptions } from "@/server/repositories/item.repository";
import { toItemDto } from "@/server/services/mappers";
import { stockService } from "@/server/services/stock.service";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";
import { decimalToNumber } from "@/lib/utils/currency";

export const itemService = {
  /**
   * `lowStockOnly` isn't a Prisma `where` filter — stockOnHand is computed
   * (openingQty + movements sum), not a stored column — so this fetches the
   * page, batches the stock computation via `stockService.getStockForItems`
   * (no N+1), attaches `stockOnHand`/`valuation` to every row, then filters
   * post-query. Acceptable at this data scale per the item-catalog page size
   * (see `ITEM_PAGE_SIZE`); revisit with a materialized/denormalized stock
   * column if the catalog grows large enough for this to matter.
   */
  async list(organizationId: string, options: ItemListOptions = {}) {
    const { lowStockOnly, ...repoOptions } = options;
    const items = await itemRepository.findMany(organizationId, repoOptions);
    const stockByItemId = await stockService.getStockForItems(
      organizationId,
      items.map((item) => ({ id: item.id, openingQty: decimalToNumber(item.openingQty) })),
    );
    const dtos = items.map((item) =>
      toItemDto(item, stockByItemId.get(item.id) ?? decimalToNumber(item.openingQty)),
    );
    if (!lowStockOnly) return dtos;
    return dtos.filter((dto) => dto.reorderLevel !== null && dto.stockOnHand <= dto.reorderLevel);
  },

  async get(organizationId: string, id: string) {
    const item = await itemRepository.findById(organizationId, id);
    if (!item) throw new NotFoundError("Item not found");
    const stock = await stockService.getItemStock(organizationId, id);
    return toItemDto(item, stock.currentQty);
  },

  async create(organizationId: string, input: CreateItemInput, actor: AuditActor = SYSTEM_ACTOR) {
    const duplicate = await itemRepository.findByName(organizationId, input.name);
    if (duplicate) throw new ValidationError("An item with this name already exists");

    return withAudit(actor, "item.create", { organizationId, entityType: "Item" }, async () => {
      const item = await itemRepository.create({
        organization: { connect: { id: organizationId } },
        name: input.name,
        sku: input.sku ?? null,
        unit: input.unit,
        hsnCode: input.hsnCode ?? null,
        gstRate: input.gstRate ?? null,
        openingQty: input.openingQty,
        reorderLevel: input.reorderLevel ?? null,
        purchasePrice: input.purchasePrice ?? null,
        salePrice: input.salePrice ?? null,
        tallyGuid: input.tallyGuid ?? null,
        tallyAlterId: input.tallyAlterId ?? null,
      });
      // No movements exist yet on a freshly created item, so stockOnHand is
      // just its opening quantity — no need for a stock query here.
      return toItemDto(item, decimalToNumber(item.openingQty));
    });
  },

  async update(
    organizationId: string,
    id: string,
    input: UpdateItemInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const existing = await itemRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Item not found");

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await itemRepository.findByName(organizationId, input.name);
      if (duplicate) throw new ValidationError("An item with this name already exists");
    }

    return withAudit(
      actor,
      "item.update",
      { organizationId, entityType: "Item", entityId: id, before: toItemDto(existing) },
      async () => {
        await itemRepository.update(organizationId, id, {
          name: input.name,
          sku: input.sku,
          unit: input.unit,
          hsnCode: input.hsnCode,
          gstRate: input.gstRate,
          openingQty: input.openingQty,
          reorderLevel: input.reorderLevel,
          purchasePrice: input.purchasePrice,
          salePrice: input.salePrice,
          tallyGuid: input.tallyGuid,
          tallyAlterId: input.tallyAlterId,
        });
        return this.get(organizationId, id);
      },
    );
  },

  async remove(organizationId: string, id: string, actor: AuditActor = SYSTEM_ACTOR) {
    const existing = await itemRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Item not found");

    return withAudit(
      actor,
      "item.delete",
      { organizationId, entityType: "Item", entityId: id, before: toItemDto(existing) },
      async () => {
        const result = await itemRepository.softDelete(organizationId, id);
        if (result.count === 0) throw new NotFoundError("Item not found");
        return { deleted: true as const };
      },
    );
  },
};
