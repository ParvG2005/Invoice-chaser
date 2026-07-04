import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreateItemInput, UpdateItemInput } from "@/lib/validations/item";
import { itemRepository, type ItemListOptions } from "@/server/repositories/item.repository";
import { toItemDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

export const itemService = {
  async list(organizationId: string, options: ItemListOptions = {}) {
    const items = await itemRepository.findMany(organizationId, options);
    return items.map(toItemDto);
  },

  async get(organizationId: string, id: string) {
    const item = await itemRepository.findById(organizationId, id);
    if (!item) throw new NotFoundError("Item not found");
    return toItemDto(item);
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
      });
      return toItemDto(item);
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
