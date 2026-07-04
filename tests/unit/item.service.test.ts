import { describe, it, expect, vi } from "vitest";
import { itemService } from "@/server/services/item.service";
import { itemRepository } from "@/server/repositories/item.repository";
import { stockRepository } from "@/server/repositories/stock.repository";
import { NotFoundError, ValidationError } from "@/lib/api/errors";

vi.mock("@/server/repositories/item.repository", () => ({
  itemRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock("@/server/repositories/stock.repository", () => ({
  stockRepository: {
    sumQty: vi.fn(),
    sumQtyByItemIds: vi.fn(),
  },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

function fakeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    organizationId: ORG,
    name: "Cotton Fabric",
    sku: null,
    unit: "Mtr",
    hsnCode: null,
    gstRate: null,
    openingQty: 100,
    reorderLevel: null,
    purchasePrice: null,
    salePrice: null,
    tallyGuid: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("itemService", () => {
  it("create rejects duplicate names in the same org", async () => {
    vi.mocked(itemRepository.findByName).mockResolvedValue(fakeItem() as never);
    await expect(
      itemService.create(ORG, { name: "Cotton Fabric", unit: "Mtr", openingQty: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("create persists and returns a DTO", async () => {
    vi.mocked(itemRepository.findByName).mockResolvedValue(null);
    vi.mocked(itemRepository.create).mockResolvedValue(fakeItem() as never);
    const dto = await itemService.create(ORG, { name: "Cotton Fabric", unit: "Mtr", openingQty: 100 });
    expect(dto).toMatchObject({ id: "item-1", name: "Cotton Fabric", unit: "Mtr", openingQty: 100 });
  });

  it("get throws NotFoundError when missing", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue(null);
    await expect(itemService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("list attaches computed stockOnHand/valuation per item", async () => {
    vi.mocked(itemRepository.findMany).mockResolvedValue([
      fakeItem({ id: "item-1", openingQty: 50, reorderLevel: 10, salePrice: 500 }),
    ] as never);
    vi.mocked(stockRepository.sumQtyByItemIds).mockResolvedValue(new Map([["item-1", -5]]));

    const dtos = await itemService.list(ORG, {});
    expect(dtos).toEqual([
      expect.objectContaining({ id: "item-1", stockOnHand: 45, valuation: 22500 }),
    ]);
  });

  it("list with lowStockOnly filters out items above their reorder level", async () => {
    vi.mocked(itemRepository.findMany).mockResolvedValue([
      fakeItem({ id: "item-1", openingQty: 50, reorderLevel: 10 }), // stockOnHand 50 > 10
      fakeItem({ id: "item-2", openingQty: 5, reorderLevel: 10 }), // stockOnHand 5 <= 10
    ] as never);
    vi.mocked(stockRepository.sumQtyByItemIds).mockResolvedValue(new Map());

    const dtos = await itemService.list(ORG, { lowStockOnly: true });
    expect(dtos.map((d) => d.id)).toEqual(["item-2"]);
  });
});
