import { describe, it, expect, vi } from "vitest";
import { stockService } from "@/server/services/stock.service";
import { stockRepository } from "@/server/repositories/stock.repository";
import { itemRepository } from "@/server/repositories/item.repository";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/stock.repository", () => ({
  stockRepository: {
    createMovement: vi.fn(),
    listMovements: vi.fn(),
    sumQty: vi.fn(),
  },
}));

vi.mock("@/server/repositories/item.repository", () => ({
  itemRepository: { findById: vi.fn() },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

describe("stockService", () => {
  it("recordMovement rejects an unknown item", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue(null);
    await expect(
      stockService.recordMovement(ORG, { itemId: "missing", qty: 5, sourceType: "ADJUSTMENT" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recordMovement persists and returns the movement DTO", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue({ id: "item-1", openingQty: 100 } as never);
    vi.mocked(stockRepository.createMovement).mockResolvedValue({
      id: "mv-1",
      organizationId: ORG,
      itemId: "item-1",
      qty: -5,
      rate: null,
      sourceType: "INVOICE",
      sourceId: "inv-1",
      godown: null,
      movementDate: new Date("2026-07-02T00:00:00.000Z"),
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
      deletedAt: null,
    } as never);

    const dto = await stockService.recordMovement(ORG, {
      itemId: "item-1",
      qty: -5,
      sourceType: "INVOICE",
      sourceId: "inv-1",
    });
    expect(dto).toMatchObject({ id: "mv-1", itemId: "item-1", qty: -5, sourceType: "INVOICE" });
  });

  it("getItemStock = openingQty + sum of movements", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue({ id: "item-1", openingQty: 100 } as never);
    vi.mocked(stockRepository.sumQty).mockResolvedValue(-25.5);
    await expect(stockService.getItemStock(ORG, "item-1")).resolves.toEqual({
      itemId: "item-1",
      currentQty: 74.5,
    });
  });
});
