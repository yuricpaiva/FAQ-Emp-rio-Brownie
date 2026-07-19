const { PrismaClient } = require('@prisma/client');
const { queryDw } = require('../services/dwDatabase');
const {
  getEverestStockSnapshot,
  isStockAvailable,
} = require('../services/everestDatabase');
const {
  buildConversionContext,
  convertOrderItems,
  convertSalesRows,
  convertStockItems,
  getRequiredStockCodes,
  roundQuantity,
} = require('../services/productionConversionService');

const prisma = new PrismaClient();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!datePattern.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateDiffInDays(startDate, endDate) {
  const startTime = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((endTime - startTime) / 86400000);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDateRange(startDate, endDate) {
  const days = dateDiffInDays(startDate, endDate);
  if (days < 0) return [];
  return Array.from({ length: days + 1 }, (_, index) => addDays(startDate, index));
}

function getWeekday(dateValue) {
  return new Date(`${dateValue}T00:00:00.000Z`).getUTCDay();
}

function toNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return toNumber(value, null);
}

function roundDecimal(value) {
  return roundQuantity(value);
}

function calculateProductionSuggestion({ averageSold, increasePercent, fixedQuantity = 0, orderQuantity = 0, stockItem }) {
  const baseQuantity = Math.max(0, Math.ceil(toNumber(averageSold) * (1 + (toNumber(increasePercent) / 100))));
  const totalBeforeStock = baseQuantity + toNumber(fixedQuantity) + toNumber(orderQuantity);
  const stockQuantity = isStockAvailable(stockItem) ? Math.max(0, toNumber(stockItem.quantity)) : 0;
  return Math.max(0, Math.round((totalBeforeStock - stockQuantity) * 10000) / 10000);
}

function mapStockItem(stockItem, stockDate) {
  const available = isStockAvailable(stockItem);
  return {
    stockQuantity: available ? toNumber(stockItem.quantity) : null,
    stockStatus: stockItem?.status || 'unavailable',
    stockDate,
    stockReason: stockItem?.reason || '',
  };
}

function normalizeStockRequestStores(stores) {
  if (!Array.isArray(stores)) return [];
  return stores.map((store) => ({
    displayName: String(store?.displayName || '').trim(),
    productCodes: Array.from(new Set(
      (Array.isArray(store?.productCodes) ? store.productCodes : [])
        .map((code) => String(code ?? '').trim())
        .filter(Boolean)
    )),
  })).filter((store) => store.displayName && store.productCodes.length);
}

function normalizeStores(stores) {
  if (!Array.isArray(stores)) return [];

  return stores
    .map((store) => {
      const displayName = String(store?.displayName || '').trim();
      const days = Array.isArray(store?.days) ? store.days : [];
      const normalizedDays = days
        .map((day) => ({
          day: String(day?.day || '').trim(),
          increasePercent: toNullableNumber(day?.increasePercent),
        }))
        .filter((day) => isValidDate(day.day));

      return { displayName, days: normalizedDays };
    })
    .filter((store) => store.displayName && store.days.length);
}

function buildEmptySuggestions(stores) {
  return Object.fromEntries(
    stores.map((store) => [
      store.displayName,
      Object.fromEntries(store.days.map((day) => [day.day, []])),
    ])
  );
}

function formatDbDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function buildComparisonDateByProductionDay(productionDays, comparisonStartDate, comparisonEndDate) {
  const sortedProductionDays = [...productionDays].sort((a, b) => a.day.localeCompare(b.day));
  const productionWeekdays = new Set(sortedProductionDays.map((day) => getWeekday(day.day)));
  const comparisonDates = getDateRange(comparisonStartDate, comparisonEndDate)
    .filter((dateValue) => productionWeekdays.has(getWeekday(dateValue)));
  const comparisonDateByProductionDay = new Map();

  sortedProductionDays.forEach((day, index) => {
    comparisonDateByProductionDay.set(day.day, comparisonDates[index] || '');
  });

  return comparisonDateByProductionDay;
}

function getNextRouteDate(dateValue, routeWeekdays) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDays(dateValue, offset);
    if (routeWeekdays.has(getWeekday(candidate))) return candidate;
  }
  return addDays(dateValue, 1);
}

function buildServedDatesByProductionDay(
  productionDays,
  comparisonStartDate,
  comparisonEndDate,
  configuredRouteWeekdays
) {
  const routeWeekdays = configuredRouteWeekdays.length
    ? new Set(configuredRouteWeekdays)
    : new Set([0, 1, 2, 3, 4, 5, 6]);
  const comparisonDateByProductionDay = buildComparisonDateByProductionDay(
    productionDays,
    comparisonStartDate,
    comparisonEndDate
  );

  return new Map(productionDays.map((day) => {
    const comparisonDate = comparisonDateByProductionDay.get(day.day);
    if (!comparisonDate) return [day.day, []];
    const nextRouteDate = getNextRouteDate(comparisonDate, routeWeekdays);
    return [day.day, getDateRange(comparisonDate, nextRouteDate)];
  }));
}

function getRowsByStoreDateAndCode(rows) {
  const rowsByStoreDateAndCode = new Map();

  rows.forEach((row) => {
    rowsByStoreDateAndCode.set(
      `${row.store_name}::${formatDbDate(row.sale_date)}::${row.codigo_produto}`,
      row
    );
  });

  return rowsByStoreDateAndCode;
}

async function suggestProduction(req, res) {
  const comparisonStartDate = String(req.body?.comparisonStartDate || '').trim();
  const comparisonEndDate = String(req.body?.comparisonEndDate || '').trim();
  const planningDay = String(req.body?.planningDay || '').trim();
  const stores = normalizeStores(req.body?.stores);

  if (!isValidDate(comparisonStartDate) || !isValidDate(comparisonEndDate)) {
    return res.status(400).json({ error: 'Informe um periodo de comparacao valido.' });
  }

  const comparisonDays = dateDiffInDays(comparisonStartDate, comparisonEndDate) + 1;
  if (comparisonDays <= 0) {
    return res.status(400).json({ error: 'A data final deve ser maior ou igual a data inicial.' });
  }

  if (!stores.length) {
    return res.status(400).json({ error: 'Informe pelo menos uma loja e um dia de producao.' });
  }

  try {
    const displayNames = stores.map((store) => store.displayName);
    const candidateStores = await prisma.productionStore.findMany({
      where: {
        displayName: { in: displayNames },
      },
      select: {
        id: true,
        active: true,
        displayName: true,
        sourceName: true,
        routes: {
          where: { active: true },
          select: { weekday: true },
        },
      },
    });
    const savedStoreIds = new Set();
    if (planningDay && isValidDate(planningDay)) {
      const savedStores = await prisma.productionPlanningStore.findMany({
        where: { planningDay: { day: planningDay }, storeName: { in: displayNames } },
        select: {
          productionStoreId: true,
          storeName: true,
          productionStore: {
            select: {
              id: true,
              active: true,
              sourceName: true,
              routes: { where: { active: true }, select: { weekday: true } },
            },
          },
        },
      });
      savedStores.forEach((store) => {
        savedStoreIds.add(store.productionStoreId);
        const savedStore = { ...store.productionStore, displayName: store.storeName };
        const candidateIndex = candidateStores.findIndex((candidate) => candidate.displayName === store.storeName);
        if (candidateIndex >= 0) candidateStores.splice(candidateIndex, 1, savedStore);
        else candidateStores.push(savedStore);
      });
    }
    const activeStores = candidateStores.filter((store) => store.active || savedStoreIds.has(store.id));
    const [activeProducts, activeConversions] = await Promise.all([
      prisma.productionProduct.findMany({
        where: { active: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      prisma.productionConversion.findMany({
        where: { active: true },
        include: { sourceProduct: { select: { code: true, name: true } } },
      }),
    ]);
    const conversionContext = buildConversionContext(activeProducts, activeConversions);
    const outputProducts = activeProducts.filter((product) => !conversionContext.sourceCodes.has(product.code));

    const sourceNameByDisplayName = new Map(activeStores.map((store) => [store.displayName, store.sourceName]));
    const activeStoreByDisplayName = new Map(activeStores.map((store) => [store.displayName, store]));
    const missingStores = displayNames.filter((displayName) => !sourceNameByDisplayName.has(displayName));
    if (missingStores.length) {
      return res.status(400).json({ error: 'Selecione apenas lojas ativas.' });
    }
    if (new Set(activeStores.map((store) => store.id)).size !== activeStores.length) {
      return res.status(400).json({ error: 'A mesma loja nao pode ser selecionada mais de uma vez.' });
    }

    if (!outputProducts.length) {
      return res.json({
        comparisonDays,
        stores: buildEmptySuggestions(stores),
      });
    }

    let queryEndDate = comparisonEndDate;
    const servedDatesByStoreAndProductionDay = new Map();
    stores.forEach((store) => {
      const activeStore = activeStoreByDisplayName.get(store.displayName);
      const servedDatesByProductionDay = buildServedDatesByProductionDay(
        store.days,
        comparisonStartDate,
        comparisonEndDate,
        (activeStore?.routes || []).map((route) => route.weekday)
      );
      servedDatesByStoreAndProductionDay.set(store.displayName, servedDatesByProductionDay);
      servedDatesByProductionDay.forEach((servedDates) => {
        const lastDate = servedDates[servedDates.length - 1];
        if (lastDate && lastDate > queryEndDate) queryEndDate = lastDate;
      });
    });

    const sourceNames = Array.from(new Set(activeStores.map((store) => store.sourceName)));
    const activeProductCodes = activeProducts.map((product) => product.code);
    const [result, stockSnapshot] = await Promise.all([
      queryDw(
      `
        SELECT
          COALESCE(v.loja, p.loja) AS store_name,
          v.data_movimento::date AS sale_date,
          p.codigo_produto,
          p.descricao_produto,
          p.familia_item,
          SUM(p.quantidade)::numeric AS quantidade_total
        FROM dw.produtos p
        JOIN dw.vendas v
          ON v.id = p.venda_id
        WHERE COALESCE(v.cancelado, false) = false
          AND p.item_type = 'PRODUCT'
          AND v.data_movimento >= $1::date
          AND v.data_movimento < ($2::date + INTERVAL '1 day')
          AND (v.loja = ANY($3::text[]) OR p.loja = ANY($3::text[]))
          AND p.codigo_produto = ANY($4::text[])
        GROUP BY
          COALESCE(v.loja, p.loja),
          v.data_movimento::date,
          p.codigo_produto,
          p.descricao_produto,
          p.familia_item
        ORDER BY
          COALESCE(v.loja, p.loja),
          v.data_movimento::date,
          p.codigo_produto
      `,
      [comparisonStartDate, queryEndDate, sourceNames, activeProductCodes]
      ),
      getEverestStockSnapshot({
        stores: displayNames,
        productCodes: activeProductCodes,
      }),
    ]);

    const convertedRows = convertSalesRows(result.rows, conversionContext);
    const rowsByStoreDateAndCode = getRowsByStoreDateAndCode(convertedRows);
    const convertedStockByStore = Object.fromEntries(displayNames.map((storeName) => [
      storeName,
      Object.fromEntries(convertStockItems(
        activeProductCodes.map((code) => ({
          code,
          ...(stockSnapshot.items?.[storeName]?.[code] || { quantity: null, status: 'unavailable', reason: 'Estoque nao consultado.' }),
        })),
        outputProducts.map((product) => product.code),
        conversionContext
      ).map((item) => [item.code, item])),
    ]));
    const suggestions = buildEmptySuggestions(stores);

    stores.forEach((store) => {
      const sourceName = sourceNameByDisplayName.get(store.displayName);
      const servedDatesByProductionDay = servedDatesByStoreAndProductionDay.get(store.displayName);

      store.days.forEach((day) => {
        const servedDates = servedDatesByProductionDay?.get(day.day) || [];

        suggestions[store.displayName][day.day] = outputProducts.map((product) => {
          const servedRows = servedDates.map((dateValue) =>
            rowsByStoreDateAndCode.get(`${sourceName}::${dateValue}::${product.code}`)
          );
          const accumulatedAverage = roundDecimal(servedRows.reduce(
            (sum, row) => sum + Math.max(0, toNumber(row?.quantidade_total, 0)),
            0
          ));
          const productRow = servedRows.find(Boolean);
          const increasePercent = day.increasePercent ?? 0;
          const stockItem = convertedStockByStore[store.displayName]?.[product.code];
          const stockData = mapStockItem(stockItem, stockSnapshot.stockDate);
          const suggestion = calculateProductionSuggestion({
            averageSold: accumulatedAverage,
            increasePercent,
            stockItem,
          });

          return {
            code: product.code,
            name: product.name,
            family: productRow?.familia_item || '',
            averageSold: accumulatedAverage,
            servedDates,
            ...stockData,
            stockSource: 'everest',
            stockSources: stockItem?.sources || [],
            fixedOrderSources: [],
            increasePercent: day.increasePercent,
            suggestion: String(suggestion),
          };
        });
      });
    });

    return res.json({
      comparisonDays,
      stockDate: stockSnapshot.stockDate,
      stockLookupStatus: stockSnapshot.status,
      warnings: stockSnapshot.warnings,
      stores: suggestions,
    });
  } catch (error) {
    console.error('Falha ao sugerir producao:', error);
    return res.status(500).json({ error: 'Nao foi possivel consultar os dados de vendas.' });
  }
}

async function getProductionStocks(req, res) {
  const stores = normalizeStockRequestStores(req.body?.stores);
  const planningDay = String(req.body?.planningDay || '').trim();
  if (!stores.length) {
    return res.status(400).json({ error: 'Informe pelo menos uma loja e um produto.' });
  }

  const displayNames = stores.map((store) => store.displayName);
  const productCodes = Array.from(new Set(stores.flatMap((store) => store.productCodes)));
  const [candidateStores, activeProducts, activeConversions] = await Promise.all([
    prisma.productionStore.findMany({
      where: { displayName: { in: displayNames } },
      select: { id: true, active: true, displayName: true },
    }),
    prisma.productionProduct.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
    }),
    prisma.productionConversion.findMany({
      where: { active: true },
      include: { sourceProduct: { select: { code: true, name: true } } },
    }),
  ]);
  const savedStoreIds = new Set();
  if (planningDay && isValidDate(planningDay)) {
    const savedStores = await prisma.productionPlanningStore.findMany({
      where: { planningDay: { day: planningDay }, storeName: { in: displayNames } },
      select: {
        productionStoreId: true,
        storeName: true,
        productionStore: { select: { id: true, active: true } },
      },
    });
    savedStores.forEach((store) => {
      savedStoreIds.add(store.productionStoreId);
      const savedStore = { ...store.productionStore, displayName: store.storeName };
      const candidateIndex = candidateStores.findIndex((candidate) => candidate.displayName === store.storeName);
      if (candidateIndex >= 0) candidateStores.splice(candidateIndex, 1, savedStore);
      else candidateStores.push(savedStore);
    });
  }
  const activeStores = candidateStores.filter((store) => store.active || savedStoreIds.has(store.id));
  const activeStoreNames = new Set(activeStores.map((store) => store.displayName));
  const activeProductCodes = new Set(activeProducts.map((product) => product.code));
  if (displayNames.some((displayName) => !activeStoreNames.has(displayName))) {
    return res.status(400).json({ error: 'Selecione apenas lojas ativas.' });
  }
  if (new Set(activeStores.map((store) => store.id)).size !== activeStores.length) {
    return res.status(400).json({ error: 'A mesma loja nao pode ser selecionada mais de uma vez.' });
  }
  if (productCodes.some((code) => !activeProductCodes.has(code))) {
    return res.status(400).json({ error: 'Consulte apenas produtos ativos.' });
  }

  const conversionContext = buildConversionContext(activeProducts, activeConversions);
  const requiredStockCodes = getRequiredStockCodes(productCodes, conversionContext);
  const stockSnapshot = await getEverestStockSnapshot({ stores: displayNames, productCodes: requiredStockCodes });
  const responseStores = Object.fromEntries(stores.map((store) => [
    store.displayName,
    Object.fromEntries(convertStockItems(
      requiredStockCodes.map((code) => ({
        code,
        ...(stockSnapshot.items?.[store.displayName]?.[code] || { quantity: null, status: 'unavailable', reason: 'Estoque nao consultado.' }),
      })),
      store.productCodes,
      conversionContext
    ).map((item) => [item.code, {
      ...mapStockItem(item, stockSnapshot.stockDate),
      stockSource: 'everest',
      stockSources: item.sources,
    }])),
  ]));

  return res.json({
    stockDate: stockSnapshot.stockDate,
    stockLookupStatus: stockSnapshot.status,
    warnings: stockSnapshot.warnings,
    stores: responseStores,
  });
}

async function applyProductionConversions(req, res) {
  const mode = String(req.body?.mode || '').trim();
  const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
  if (!['orders', 'stock'].includes(mode) || !groups.length || groups.length > 200) {
    return res.status(400).json({ error: 'Informe o modo e os grupos para conversao.' });
  }

  try {
    const [products, conversions] = await Promise.all([
      prisma.productionProduct.findMany({
        where: { active: true },
        select: { code: true, name: true },
      }),
      prisma.productionConversion.findMany({
        where: { active: true },
        include: { sourceProduct: { select: { code: true, name: true } } },
      }),
    ]);
    const context = buildConversionContext(products, conversions);
    const convertedGroups = groups.map((group) => {
      const key = String(group?.key || '').trim();
      const items = Array.isArray(group?.items) ? group.items : [];
      if (!key || items.length > 10000) throw new Error('INVALID_GROUP');
      if (items.some((item) => {
        const fields = mode === 'orders' ? ['fixedQuantity', 'orderQuantity'] : ['quantity'];
        return fields.some((field) => item?.[field] !== null && item?.[field] !== undefined && toNumber(item[field], -1) < 0);
      })) throw new Error('INVALID_QUANTITY');

      if (mode === 'orders') {
        return { key, items: convertOrderItems(items, context) };
      }
      const outputCodes = Array.isArray(group?.outputCodes)
        ? Array.from(new Set(group.outputCodes.map((code) => String(code || '').trim()).filter(Boolean)))
        : [];
      return { key, items: convertStockItems(items, outputCodes, context) };
    });
    return res.json({ mode, groups: convertedGroups });
  } catch (error) {
    if (['INVALID_GROUP', 'INVALID_QUANTITY'].includes(error.message)) {
      return res.status(400).json({ error: 'Existem grupos ou quantidades invalidas para conversao.' });
    }
    console.error('Falha ao aplicar conversoes de producao:', error);
    return res.status(500).json({ error: 'Nao foi possivel aplicar as conversoes.' });
  }
}

module.exports = {
  applyProductionConversions,
  calculateProductionSuggestion,
  getProductionStocks,
  suggestProduction,
};
