export const mockStores = [
  "Emporio Brownie - Aldeota",
  "Emporio Brownie - Iguatemi",
  "Emporio Brownie - RioMar",
  "Emporio Brownie - Eusébio",
];

export const mockProducts = [
  { code: "BRW-001", name: "Brownie tradicional", averageSold: 118, stockQuantity: 34 },
  { code: "BRW-002", name: "Brownie doce de leite", averageSold: 82, stockQuantity: 18 },
  { code: "BRW-003", name: "Brownie ninho com nutella", averageSold: 96, stockQuantity: 22 },
  { code: "BRW-004", name: "Brownie meio amargo", averageSold: 64, stockQuantity: 16 },
  { code: "BRW-005", name: "Caixa degustação 4 unidades", averageSold: 42, stockQuantity: 9 },
];

const storeProductFactors = {
  "Emporio Brownie - Aldeota": { average: 1, stock: 1 },
  "Emporio Brownie - Iguatemi": { average: 1.18, stock: 0.82 },
  "Emporio Brownie - RioMar": { average: 1.32, stock: 0.74 },
  "Emporio Brownie - Eusébio": { average: 0.88, stock: 1.16 },
};

const productionDays = [
  {
    day: "2026-07-04",
    comparisonStartDate: "2026-06-27",
    comparisonEndDate: "2026-06-27",
    createdAt: "2026-07-02T09:30:00.000Z",
    status: "nao_iniciado",
    producedItems: {},
    stores: {
      "Emporio Brownie - Aldeota": {
        defaultIncreasePercent: 12,
        products: [
          { code: "BRW-001", name: "Brownie tradicional", averageSold: 118, stockQuantity: 34, suggestion: 98, increasePercent: 12 },
          { code: "BRW-002", name: "Brownie doce de leite", averageSold: 82, stockQuantity: 18, suggestion: 72, increasePercent: 10 },
          { code: "BRW-003", name: "Brownie ninho com nutella", averageSold: 96, stockQuantity: 22, suggestion: 88, increasePercent: 15 },
        ],
      },
      "Emporio Brownie - RioMar": {
        defaultIncreasePercent: 8,
        products: [
          { code: "BRW-001", name: "Brownie tradicional", averageSold: 156, stockQuantity: 25, suggestion: 126, increasePercent: 8 },
          { code: "BRW-004", name: "Brownie meio amargo", averageSold: 84, stockQuantity: 12, suggestion: 49, increasePercent: 8 },
          { code: "BRW-005", name: "Caixa degustação 4 unidades", averageSold: 55, stockQuantity: 7, suggestion: 34, increasePercent: 6 },
        ],
      },
    },
  },
  {
    day: "2026-07-05",
    comparisonStartDate: "2026-06-28",
    comparisonEndDate: "2026-06-28",
    createdAt: "2026-07-02T11:00:00.000Z",
    status: "em_producao",
    producedItems: {},
    stores: {
      "Emporio Brownie - RioMar": {
        defaultIncreasePercent: 8,
        products: [
          { code: "BRW-001", name: "Brownie tradicional", averageSold: 142, stockQuantity: 28, suggestion: 126, increasePercent: 8 },
          { code: "BRW-004", name: "Brownie meio amargo", averageSold: 58, stockQuantity: 14, suggestion: 49, increasePercent: 8 },
          { code: "BRW-005", name: "Caixa degustação 4 unidades", averageSold: 38, stockQuantity: 6, suggestion: 34, increasePercent: 6 },
        ],
      },
    },
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toLocalDate(value) {
  return new Date(`${value}T00:00:00`);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBaseMetric(product, index, field, fallbackStart, fallbackStep) {
  const numericValue = Number(product[field]);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  return fallbackStart + (index * fallbackStep);
}

export function getMockProductsForStore(store, { defaultIncreasePercent = 10, products = mockProducts } = {}) {
  const factor = storeProductFactors[store] || { average: 1, stock: 1 };

  return products.map((product, index) => {
    const baseAverageSold = getBaseMetric(product, index, "averageSold", 48, 8);
    const baseStockQuantity = getBaseMetric(product, index, "stockQuantity", 12, 3);
    const averageSold = Math.max(0, Math.round(baseAverageSold * factor.average));
    const stockQuantity = Math.max(0, Math.round(baseStockQuantity * factor.stock));

    return {
      code: product.code,
      name: product.name,
      averageSold,
      stockQuantity,
      increasePercent: String(defaultIncreasePercent),
      suggestion: String(averageSold),
    };
  });
}

export function listMockProductionDays() {
  return clone(productionDays).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getMockProductionDay(day) {
  const productionDay = productionDays.find((item) => item.day === day);
  return productionDay ? clone(productionDay) : null;
}

export function upsertMockProductionPlanForRange(payload) {
  const startDate = toLocalDate(payload.servedStartDate);
  const endDate = toLocalDate(payload.servedEndDate);
  const now = new Date().toISOString();
  const storesPayload = payload.stores || {
    [payload.store]: {
      defaultIncreasePercent: payload.defaultIncreasePercent,
      products: payload.products,
    },
  };

  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const day = toInputDate(date);
    const existingDay = productionDays.find((item) => item.day === day);
    const dayStoresPayload = payload.storesByDay?.[day] || storesPayload;
    if (!Object.keys(dayStoresPayload).length) {
      continue;
    }
    const normalizedStores = Object.fromEntries(
      Object.entries(dayStoresPayload).map(([storeName, storeProduction]) => [
        storeName,
        {
          defaultIncreasePercent: storeProduction.defaultIncreasePercent,
          products: clone(storeProduction.products),
        },
      ])
    );

    if (existingDay) {
      existingDay.comparisonStartDate = payload.comparisonStartDate;
      existingDay.comparisonEndDate = payload.comparisonEndDate;
      existingDay.stores = {
        ...existingDay.stores,
        ...normalizedStores,
      };
    } else {
      productionDays.push({
        day,
        comparisonStartDate: payload.comparisonStartDate,
        comparisonEndDate: payload.comparisonEndDate,
        createdAt: now,
        status: "nao_iniciado",
        producedItems: {},
        dispatchItems: {},
        stores: normalizedStores,
      });
    }
  }
}

export function updateMockProductionDay(day, payload) {
  const existingDay = productionDays.find((item) => item.day === day);
  if (!existingDay) return null;

  existingDay.comparisonStartDate = payload.comparisonStartDate;
  existingDay.comparisonEndDate = payload.comparisonEndDate;
  existingDay.stores = clone(payload.stores);

  return clone(existingDay);
}

export function updateMockProductionDayStatus(day, status) {
  const existingDay = productionDays.find((item) => item.day === day);
  if (!existingDay) return null;

  existingDay.status = status;
  return clone(existingDay);
}

export function updateMockDispatchItem(day, storeName, productCode, dispatchItem) {
  const existingDay = productionDays.find((item) => item.day === day);
  if (!existingDay) return null;

  const storeItems = {
    ...(existingDay.dispatchItems?.[storeName] || {}),
  };
  if (dispatchItem) {
    storeItems[productCode] = clone(dispatchItem);
  } else {
    delete storeItems[productCode];
  }

  existingDay.dispatchItems = {
    ...(existingDay.dispatchItems || {}),
    [storeName]: storeItems,
  };

  return clone(existingDay);
}

export function finalizeMockProductionDispatch(day) {
  return updateMockProductionDayStatus(day, "finalizado");
}
