import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPurchaseOrder, listPurchaseOrders, searchProducts, searchSuppliers, updatePurchaseOrder } from "../services/purchaseOrderService";
import { calculateSubtotalCents, calculateTotals, filterPurchaseOrders, formatCnpj, isValidCnpj, normalizeCnpj, normalizeDecimal, parseMoneyToCents, validatePurchaseDraft } from "./purchaseOrders";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock("../services/api", () => ({ default: apiMock }));

beforeEach(() => { vi.clearAllMocks(); });

describe("valores do pedido", () => {
  it("normaliza decimais brasileiros e arredonda dinheiro", () => {
    expect(normalizeDecimal(" 01,2500 ")).toBe("1.25");
    expect(parseMoneyToCents("10,005")).toBe(1001);
    expect(calculateSubtotalCents("1,25", 1099)).toBe(1374);
  });

  it("normaliza, formata e valida CNPJ", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("soma produtos e acréscimos em centavos", () => {
    expect(calculateTotals([{ subtotalCents: 1374 }, { subtotalCents: 626 }], [{ amountCents: 350 }])).toEqual({ productSubtotalCents: 2000, additionsTotalCents: 350, totalCents: 2350 });
  });
});

describe("validação e filtros", () => {
  it("exige fornecedor, produto e acréscimo completo", () => {
    const errors = validatePurchaseDraft({ supplier: null, items: [], additions: [{ description: "Frete", amountInput: "", amountCents: 0 }] });
    expect(errors.supplier).toBeTruthy();
    expect(errors.items).toBeTruthy();
    expect(errors.paymentMethod).toBeTruthy();
    expect(errors["addition-0"]).toBeTruthy();
  });

  it("exige descrição e unidade em produto avulso", () => {
    const errors = validatePurchaseDraft({ supplier: { id: "supplier" }, items: [{ productSource: "MANUAL", description: "", supplierUnit: { label: "" }, quantity: "1", unitPriceCents: 100 }], additions: [] });
    expect(errors["item-0-description"]).toBeTruthy();
    expect(errors["item-0-unit"]).toBeTruthy();
  });

  it("aplica filtros combinados e ordena do mais recente", () => {
    const orders = [
      { number: "PC-202611-0001", createdAt: "2026-11-02T12:00:00Z", supplier: { id: "a" }, buyer: { id: "1" }, items: [{ productId: "product-chocolate" }] },
      { number: "PC-202611-0002", createdAt: "2026-11-05T12:00:00Z", supplier: { id: "a" }, buyer: { id: "1" }, items: [{ productId: "product-acucar" }] },
    ];
    expect(filterPurchaseOrders(orders, { month: "2026-11", supplierId: "a", buyerId: "1", number: "0002", productId: "product-acucar" }).map((item) => item.number)).toEqual(["PC-202611-0002"]);
  });
});

describe("serviço compartilhado", () => {
  it("consulta fornecedores e produtos na API do Everest", async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: [{ id: "12345678000190", name: "Fornecedor" }] })
      .mockResolvedValueOnce({ data: [{ id: "103", description: "LEITE CONDENSADO" }] });
    const suppliers = await searchSuppliers("fornecedor");
    const products = await searchProducts({ supplierId: "12345678000190", query: "leite" });
    expect(apiMock.get).toHaveBeenNthCalledWith(1, "/purchases/suppliers", { params: { query: "fornecedor" } });
    expect(apiMock.get).toHaveBeenNthCalledWith(2, "/purchases/products", { params: { supplierId: "12345678000190", query: "leite" } });
    expect(suppliers[0].name).toBe("Fornecedor");
    expect(products[0].description).toBe("LEITE CONDENSADO");
  });

  it("envia filtros e retorna pedidos da API", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { orders: [{ id: "1" }], totalStored: 1, buyers: [] } });
    const result = await listPurchaseOrders({ month: "2026-11", status: "", productId: "prd-1" });
    expect(apiMock.get).toHaveBeenCalledWith("/purchases/orders", { params: { month: "2026-11", productId: "prd-1" } });
    expect(result.orders).toHaveLength(1);
  });

  it("usa endpoints administrativos para editar e cancelar", async () => {
    apiMock.put.mockResolvedValueOnce({ data: { id: "8", totalCents: 1000 } });
    apiMock.patch.mockResolvedValueOnce({ data: { id: "8", status: "CANCELLED" } });
    await updatePurchaseOrder("8", { items: [] });
    const cancelled = await cancelPurchaseOrder("8");
    expect(apiMock.put).toHaveBeenCalledWith("/purchases/orders/8", { items: [] });
    expect(apiMock.patch).toHaveBeenCalledWith("/purchases/orders/8/cancel");
    expect(cancelled.status).toBe("CANCELLED");
  });
});
