const { PrismaClient, Prisma } = require('@prisma/client');
const { hasAtMostFourDecimalPlaces, normalizeDecimalText } = require('../utils/decimal');

const prisma = new PrismaClient();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const editableStatuses = new Set(['nao_iniciado', 'em_producao']);
const dispatchStatuses = new Set(['complete', 'incomplete']);

function isDispatchableItem(item) {
  return Number(item?.suggestion || 0) > 0;
}

class PlanningError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const planningInclude = {
  stores: {
    orderBy: { storeName: 'asc' },
    include: {
      products: { orderBy: [{ name: 'asc' }, { code: 'asc' }] },
    },
  },
};

function isValidDate(value) {
  if (!datePattern.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getWeekday(value) {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

function storeServesDay(store, day) {
  const weekdays = (store.routes || []).map((route) => route.weekday);
  return !weekdays.length || weekdays.includes(getWeekday(day));
}

function comparisonServesDay(startDate, endDate, productionDay) {
  const productionWeekday = getWeekday(productionDay);
  return getDateRange(startDate, endDate).some((day) => getWeekday(day) === productionWeekday);
}

function getDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates = [];
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

function toNumber(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || String(value).trim() === '')) return null;
  const number = Number(normalizeDecimalText(value));
  if (!Number.isFinite(number) || number < 0) {
    throw new PlanningError(400, `${field} deve ser um numero maior ou igual a zero.`);
  }
  if (!hasAtMostFourDecimalPlaces(value)) {
    throw new PlanningError(400, `${field} deve ter no maximo quatro casas decimais.`);
  }
  return number;
}

function normalizeServedDates(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String).filter(isValidDate))).sort();
}

function normalizeFixedOrderSources(value) {
  if (!Array.isArray(value)) return [];
  return value.map((source) => ({
    code: String(source?.code || '').trim(),
    name: String(source?.name || '').trim(),
    fixedQuantity: toNumber(source?.fixedQuantity ?? 0, 'Quantidade fixa da composicao'),
    orderQuantity: toNumber(source?.orderQuantity ?? 0, 'Quantidade de encomenda da composicao'),
    factor: toNumber(source?.factor ?? 1, 'Fator da composicao'),
    convertedCode: String(source?.convertedCode || '').trim(),
    convertedName: String(source?.convertedName || '').trim(),
  })).filter((source) => source.code && source.convertedCode && source.factor > 0);
}

function normalizeStockSources(value) {
  if (!Array.isArray(value)) return [];
  return value.map((source) => ({
    code: String(source?.code || '').trim(),
    name: String(source?.name || '').trim(),
    quantity: toNumber(source?.quantity, 'Quantidade de estoque da composicao', { nullable: true }),
    status: String(source?.status || 'unavailable').trim(),
    reason: String(source?.reason || '').trim(),
    factor: toNumber(source?.factor ?? 1, 'Fator de estoque da composicao'),
    convertedQuantity: toNumber(source?.convertedQuantity, 'Estoque convertido', { nullable: true }),
  })).filter((source) => source.code && source.factor > 0);
}

function normalizeProduct(product) {
  const code = String(product?.code || '').trim();
  const name = String(product?.name || '').trim();
  if (!code || !name) throw new PlanningError(400, 'Todos os produtos devem ter codigo e nome.');
  return {
    code,
    name,
    family: String(product?.family || '').trim(),
    averageSold: toNumber(product?.averageSold ?? 0, `Media vendida de ${code}`),
    servedDates: normalizeServedDates(product?.servedDates),
    stockQuantity: toNumber(product?.stockQuantity, `Estoque de ${code}`, { nullable: true }),
    stockStatus: String(product?.stockStatus || 'unavailable').trim(),
    stockDate: isValidDate(product?.stockDate) ? product.stockDate : '',
    stockReason: String(product?.stockReason || '').trim(),
    stockSource: String(product?.stockSource || '').trim(),
    increasePercent: toNumber(product?.increasePercent, `Percentual de ${code}`, { nullable: true }),
    fixedQuantity: toNumber(product?.fixedQuantity ?? 0, `Fixos de ${code}`),
    orderQuantity: toNumber(product?.orderQuantity ?? 0, `Encomendas de ${code}`),
    fixedOrderSources: normalizeFixedOrderSources(product?.fixedOrderSources),
    stockSources: normalizeStockSources(product?.stockSources),
    suggestion: toNumber(product?.suggestion ?? 0, `Quantidade a ser enviada de ${code}`),
    importedOnly: Boolean(product?.importedOnly),
  };
}

function normalizeStores(stores) {
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) {
    throw new PlanningError(400, 'Informe as lojas do planejamento.');
  }
  const normalized = Object.entries(stores).map(([storeName, store]) => {
    const name = String(storeName || '').trim();
    const products = Array.isArray(store?.products) ? store.products.map(normalizeProduct) : [];
    if (!name || !products.length) throw new PlanningError(400, 'Cada loja deve possuir pelo menos um produto.');
    if (new Set(products.map((product) => product.code)).size !== products.length) {
      throw new PlanningError(400, `A loja ${name} possui produtos duplicados.`);
    }
    return {
      storeName: name,
      defaultIncreasePercent: toNumber(
        store?.defaultIncreasePercent,
        `Percentual padrao de ${name}`,
        { nullable: true }
      ),
      products,
    };
  });
  if (!normalized.length) throw new PlanningError(400, 'Informe pelo menos uma loja.');
  return normalized;
}

function decimalToNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function parseServedDates(value) {
  try {
    const dates = JSON.parse(value || '[]');
    return Array.isArray(dates) ? dates : [];
  } catch {
    return [];
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getProductionElapsedSeconds(day, now = new Date()) {
  if (!day?.productionStartedAt) return null;
  const startedAt = new Date(day.productionStartedAt).getTime();
  const finishedAt = day.productionFinishedAt
    ? new Date(day.productionFinishedAt).getTime()
    : new Date(now).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null;
  return Math.max(0, Math.floor((finishedAt - startedAt) / 1000));
}

function assertCanStartProduction(day) {
  if (day.status !== 'nao_iniciado' || day.productionStartedAt) {
    throw new PlanningError(409, 'Esta producao ja foi iniciada e o cronometro nao pode ser reiniciado.');
  }
}

function assertCanFinalizeProduction(day) {
  if (day.status !== 'em_producao' || !day.productionStartedAt || day.productionFinishedAt) {
    throw new PlanningError(409, 'Inicie a producao antes de finalizar a expedicao.');
  }
}

function serializePlanningDay(day) {
  const dispatchItems = {};
  const stores = Object.fromEntries(day.stores.map((store) => {
    const products = store.products.map((item) => {
      if (item.dispatchStatus) {
        dispatchItems[store.storeName] ||= {};
        dispatchItems[store.storeName][item.code] = {
          status: item.dispatchStatus,
          actualQuantity: decimalToNumber(item.actualQuantity),
          justification: item.justification || '',
        };
      }
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        family: item.family,
        averageSold: decimalToNumber(item.averageSold),
        servedDates: parseServedDates(item.servedDates),
        stockQuantity: decimalToNumber(item.stockQuantity),
        stockStatus: item.stockStatus,
        stockDate: item.stockDate,
        stockReason: item.stockReason,
        stockSource: item.stockSource,
        increasePercent: decimalToNumber(item.increasePercent),
        fixedQuantity: decimalToNumber(item.fixedQuantity),
        orderQuantity: decimalToNumber(item.orderQuantity),
        fixedOrderSources: parseJsonArray(item.fixedOrderSources),
        stockSources: parseJsonArray(item.stockSources),
        suggestion: decimalToNumber(item.suggestion),
        importedOnly: item.importedOnly,
      };
    });
    return [store.storeName, {
      id: store.id,
      productionStoreId: store.productionStoreId,
      defaultIncreasePercent: decimalToNumber(store.defaultIncreasePercent),
      products,
    }];
  }));
  return {
    id: day.id,
    day: day.day,
    comparisonStartDate: day.comparisonStartDate,
    comparisonEndDate: day.comparisonEndDate,
    status: day.status,
    productionStartedAt: day.productionStartedAt?.toISOString() || null,
    productionFinishedAt: day.productionFinishedAt?.toISOString() || null,
    productionElapsedSeconds: getProductionElapsedSeconds(day),
    createdAt: day.createdAt.toISOString(),
    updatedAt: day.updatedAt.toISOString(),
    stores,
    dispatchItems,
    producedItems: {},
  };
}

async function resolveReferences(client, stores, { requireActiveStores, existingStores = [] }) {
  const storeNames = stores.map((store) => store.storeName);
  const productCodes = Array.from(new Set(stores.flatMap((store) => store.products.map((product) => product.code))));
  const existingStoreIds = existingStores.map((store) => store.productionStoreId);
  const existingProductIds = existingStores.flatMap((store) =>
    store.products.map((product) => product.productionProductId)
  );
  const [dbStores, dbProducts] = await Promise.all([
    client.productionStore.findMany({
      where: {
        OR: [
          { displayName: { in: storeNames } },
          ...(existingStoreIds.length ? [{ id: { in: existingStoreIds } }] : []),
        ],
        ...(requireActiveStores ? { active: true } : {}),
      },
      select: {
        id: true,
        displayName: true,
        active: true,
        routes: { where: { active: true }, select: { weekday: true } },
      },
    }),
    client.productionProduct.findMany({
      where: {
        OR: [
          { code: { in: productCodes } },
          ...(existingProductIds.length ? [{ id: { in: existingProductIds } }] : []),
        ],
      },
      select: { id: true, code: true, active: true },
    }),
  ]);
  const storeByName = new Map(dbStores.map((store) => [store.displayName, store]));
  const productByCode = new Map(dbProducts.map((product) => [product.code, product]));
  existingStores.forEach((store) => {
    const reference = dbStores.find((item) => item.id === store.productionStoreId);
    if (reference) storeByName.set(store.storeName, reference);
    store.products.forEach((product) => {
      const productReference = dbProducts.find((item) => item.id === product.productionProductId);
      if (productReference) productByCode.set(product.code, productReference);
    });
  });
  const missingStores = storeNames.filter((name) => !storeByName.has(name));
  const missingProducts = productCodes.filter((code) => !productByCode.has(code));
  if (missingStores.length) throw new PlanningError(400, `Lojas invalidas: ${missingStores.join(', ')}.`);
  if (missingProducts.length) throw new PlanningError(400, `Produtos nao cadastrados: ${missingProducts.join(', ')}.`);
  return { storeByName, productByCode };
}

function productData(product, productId) {
  return {
    productionProductId: productId,
    code: product.code,
    name: product.name,
    family: product.family,
    averageSold: product.averageSold,
    servedDates: JSON.stringify(product.servedDates),
    stockQuantity: product.stockQuantity,
    stockStatus: product.stockStatus,
    stockDate: product.stockDate,
    stockReason: product.stockReason,
    stockSource: product.stockSource,
    increasePercent: product.increasePercent,
    fixedQuantity: product.fixedQuantity,
    orderQuantity: product.orderQuantity,
    fixedOrderSources: JSON.stringify(product.fixedOrderSources),
    stockSources: JSON.stringify(product.stockSources),
    suggestion: product.suggestion,
    importedOnly: product.importedOnly,
  };
}

function itemFingerprint(item) {
  return JSON.stringify({
    code: item.code,
    name: item.name,
    family: item.family || '',
    averageSold: Number(item.averageSold),
    servedDates: typeof item.servedDates === 'string' ? parseServedDates(item.servedDates) : item.servedDates,
    stockQuantity: decimalToNumber(item.stockQuantity),
    stockStatus: item.stockStatus,
    stockDate: item.stockDate || '',
    stockReason: item.stockReason || '',
    stockSource: item.stockSource || '',
    increasePercent: decimalToNumber(item.increasePercent),
    fixedQuantity: Number(item.fixedQuantity),
    orderQuantity: Number(item.orderQuantity),
    fixedOrderSources: typeof item.fixedOrderSources === 'string' ? parseJsonArray(item.fixedOrderSources) : item.fixedOrderSources,
    stockSources: typeof item.stockSources === 'string' ? parseJsonArray(item.stockSources) : item.stockSources,
    suggestion: Number(item.suggestion),
    importedOnly: Boolean(item.importedOnly),
  });
}

async function createPlanning(req, res) {
  const comparisonStartDate = String(req.body?.comparisonStartDate || '');
  const comparisonEndDate = String(req.body?.comparisonEndDate || '');
  const storesByDay = req.body?.storesByDay;
  if (!isValidDate(comparisonStartDate) || !isValidDate(comparisonEndDate) || comparisonStartDate > comparisonEndDate) {
    return res.status(400).json({ error: 'Informe um periodo de comparacao valido.' });
  }
  try {
    const days = Object.entries(storesByDay || {})
      .filter(([, stores]) => stores && Object.keys(stores).length)
      .map(([day, stores]) => ({ day, stores: normalizeStores(stores) }));
    if (!days.length || days.some(({ day }) => !isValidDate(day))) {
      throw new PlanningError(400, 'Informe pelo menos um dia de producao valido.');
    }
    if (days.some(({ day }) => !comparisonServesDay(comparisonStartDate, comparisonEndDate, day))) {
      throw new PlanningError(400, 'O periodo comparado deve conter um dia da semana correspondente a cada producao.');
    }
    const duplicateDays = days.filter((entry, index) => days.findIndex((item) => item.day === entry.day) !== index);
    if (duplicateDays.length) throw new PlanningError(400, 'Existem dias de producao duplicados.');

    const created = await prisma.$transaction(async (tx) => {
      const dayNames = days.map(({ day }) => day);
      const conflicts = await tx.productionPlanningDay.findMany({
        where: { day: { in: dayNames } }, select: { day: true }, orderBy: { day: 'asc' },
      });
      if (conflicts.length) {
        throw new PlanningError(409, 'Ja existe planejamento para uma ou mais datas.', {
          conflictDays: conflicts.map((item) => item.day),
        });
      }
      const allStores = days.flatMap(({ stores }) => stores);
      const references = await resolveReferences(tx, allStores, { requireActiveStores: true });
      const inactiveProducts = Array.from(references.productByCode.values()).filter((product) => !product.active);
      if (inactiveProducts.length) {
        throw new PlanningError(400, `Produtos inativos nao podem ser adicionados: ${inactiveProducts.map((product) => product.code).join(', ')}.`);
      }
      const invalidRoutes = days.flatMap(({ day, stores }) => stores
        .filter((store) => !storeServesDay(references.storeByName.get(store.storeName), day))
        .map((store) => `${store.storeName} (${day})`));
      if (invalidRoutes.length) {
        throw new PlanningError(400, `Lojas sem rota no dia informado: ${invalidRoutes.join(', ')}.`);
      }
      const results = [];
      for (const entry of days) {
        const planningDay = await tx.productionPlanningDay.create({
          data: {
            day: entry.day,
            comparisonStartDate,
            comparisonEndDate,
            stores: {
              create: entry.stores.map((store) => ({
                productionStoreId: references.storeByName.get(store.storeName).id,
                storeName: store.storeName,
                defaultIncreasePercent: store.defaultIncreasePercent,
                products: {
                  create: store.products.map((product) => productData(
                    product,
                    references.productByCode.get(product.code).id
                  )),
                },
              })),
            },
          },
          include: planningInclude,
        });
        results.push(serializePlanningDay(planningDay));
      }
      return results;
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel salvar o planejamento.');
  }
}

async function listPlanning(req, res) {
  const startDate = String(req.query?.startDate || '');
  const endDate = String(req.query?.endDate || '');
  if ((startDate && !isValidDate(startDate)) || (endDate && !isValidDate(endDate)) || (startDate && endDate && startDate > endDate)) {
    return res.status(400).json({ error: 'Informe um periodo valido.' });
  }
  try {
    const days = await prisma.productionPlanningDay.findMany({
      where: { day: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } },
      orderBy: { day: 'desc' },
      include: planningInclude,
    });
    return res.json(days.map(serializePlanningDay));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel carregar os planejamentos.');
  }
}

async function getPlanning(req, res) {
  try {
    const day = await prisma.productionPlanningDay.findUnique({
      where: { day: req.params.day }, include: planningInclude,
    });
    if (!day) return res.status(404).json({ error: 'Planejamento nao encontrado.' });
    return res.json(serializePlanningDay(day));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel carregar o planejamento.');
  }
}

async function updatePlanning(req, res) {
  const dayValue = req.params.day;
  const comparisonStartDate = String(req.body?.comparisonStartDate || '');
  const comparisonEndDate = String(req.body?.comparisonEndDate || '');
  const updatedAt = String(req.body?.updatedAt || '');
  if (!isValidDate(dayValue) || !isValidDate(comparisonStartDate) || !isValidDate(comparisonEndDate) || comparisonStartDate > comparisonEndDate) {
    return res.status(400).json({ error: 'Informe datas validas.' });
  }
  if (!comparisonServesDay(comparisonStartDate, comparisonEndDate, dayValue)) {
    return res.status(400).json({ error: 'O periodo comparado deve conter uma data correspondente ao dia da semana da producao.' });
  }
  try {
    const stores = normalizeStores(req.body?.stores);
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.productionPlanningDay.findUnique({
        where: { day: dayValue }, include: planningInclude,
      });
      if (!current) throw new PlanningError(404, 'Planejamento nao encontrado.');
      if (!editableStatuses.has(current.status)) throw new PlanningError(409, 'Planejamentos finalizados nao podem ser editados.');
      if (!updatedAt || current.updatedAt.toISOString() !== updatedAt) {
        throw new PlanningError(409, 'Este planejamento foi alterado por outro usuario. Recarregue a pagina.');
      }
      const references = await resolveReferences(tx, stores, {
        requireActiveStores: false,
        existingStores: current.stores,
      });
      const existingStoreIds = new Set(current.stores.map((store) => store.productionStoreId));
      const existingProductIds = new Set(current.stores.flatMap((store) =>
        store.products.map((product) => product.productionProductId)
      ));
      const inactiveNewStores = stores.filter((store) => {
        const reference = references.storeByName.get(store.storeName);
        return !reference.active && !existingStoreIds.has(reference.id);
      });
      if (inactiveNewStores.length) {
        throw new PlanningError(400, `Lojas inativas nao podem ser adicionadas: ${inactiveNewStores.map((store) => store.storeName).join(', ')}.`);
      }
      const storesWithoutRoute = stores.filter((store) => {
        const reference = references.storeByName.get(store.storeName);
        return !existingStoreIds.has(reference.id) && !storeServesDay(reference, dayValue);
      });
      if (storesWithoutRoute.length) {
        throw new PlanningError(400, `Lojas sem rota no dia informado: ${storesWithoutRoute.map((store) => store.storeName).join(', ')}.`);
      }
      const inactiveNewProducts = Array.from(references.productByCode.values()).filter((product) =>
        !product.active && !existingProductIds.has(product.id)
      );
      if (inactiveNewProducts.length) {
        throw new PlanningError(400, `Produtos inativos nao podem ser adicionados: ${inactiveNewProducts.map((product) => product.code).join(', ')}.`);
      }
      const comparisonChanged = current.comparisonStartDate !== comparisonStartDate || current.comparisonEndDate !== comparisonEndDate;
      const incomingStoreIds = new Set(stores.map((store) => references.storeByName.get(store.storeName).id));
      if (incomingStoreIds.size !== stores.length) {
        throw new PlanningError(400, 'A mesma loja nao pode ser adicionada mais de uma vez ao planejamento.');
      }

      for (const existingStore of current.stores) {
        if (!incomingStoreIds.has(existingStore.productionStoreId)) {
          await tx.productionPlanningStore.delete({ where: { id: existingStore.id } });
        }
      }

      for (const store of stores) {
        const storeReference = references.storeByName.get(store.storeName);
        let planningStore = current.stores.find((item) => item.productionStoreId === storeReference.id);
        if (!planningStore) {
          planningStore = await tx.productionPlanningStore.create({
            data: {
              planningDayId: current.id,
              productionStoreId: storeReference.id,
              storeName: store.storeName,
              defaultIncreasePercent: store.defaultIncreasePercent,
            },
            include: { products: true },
          });
        } else {
          await tx.productionPlanningStore.update({
            where: { id: planningStore.id },
            data: { storeName: store.storeName, defaultIncreasePercent: store.defaultIncreasePercent },
          });
        }
        const existingProducts = planningStore.products || [];
        const incomingProductIds = new Set(store.products.map((product) => references.productByCode.get(product.code).id));
        for (const existingProduct of existingProducts) {
          if (!incomingProductIds.has(existingProduct.productionProductId)) {
            await tx.productionPlanningItem.delete({ where: { id: existingProduct.id } });
          }
        }
        for (const product of store.products) {
          const productReference = references.productByCode.get(product.code);
          const existingProduct = existingProducts.find((item) => item.productionProductId === productReference.id);
          const data = productData(product, productReference.id);
          if (!existingProduct) {
            await tx.productionPlanningItem.create({ data: { planningStoreId: planningStore.id, ...data } });
          } else {
            const changed = comparisonChanged || itemFingerprint(existingProduct) !== itemFingerprint(product);
            await tx.productionPlanningItem.update({
              where: { id: existingProduct.id },
              data: {
                ...data,
                ...(changed ? { dispatchStatus: null, actualQuantity: null, justification: '' } : {}),
              },
            });
          }
        }
      }

      const updateResult = await tx.productionPlanningDay.updateMany({
        where: { id: current.id, updatedAt: current.updatedAt },
        data: { comparisonStartDate, comparisonEndDate },
      });
      if (updateResult.count !== 1) throw new PlanningError(409, 'Este planejamento foi alterado por outro usuario. Recarregue a pagina.');
      return tx.productionPlanningDay.findUnique({ where: { id: current.id }, include: planningInclude });
    });
    return res.json(serializePlanningDay(result));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel atualizar o planejamento.');
  }
}

async function updatePlanningStatus(req, res) {
  const status = String(req.body?.status || '');
  if (status !== 'em_producao') {
    return res.status(400).json({ error: 'A producao nao pode ser pausada depois de iniciada.' });
  }
  try {
    const current = await prisma.productionPlanningDay.findUnique({ where: { day: req.params.day } });
    if (!current) throw new PlanningError(404, 'Planejamento nao encontrado.');
    assertCanStartProduction(current);
    const startedAt = new Date();
    const updateResult = await prisma.productionPlanningDay.updateMany({
      where: { id: current.id, status: 'nao_iniciado', productionStartedAt: null },
      data: { status: 'em_producao', productionStartedAt: startedAt },
    });
    if (updateResult.count !== 1) {
      throw new PlanningError(409, 'Esta producao ja foi iniciada e o cronometro nao pode ser reiniciado.');
    }
    const updated = await prisma.productionPlanningDay.findUnique({
      where: { id: current.id }, include: planningInclude,
    });
    return res.json(serializePlanningDay(updated));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel alterar o status.');
  }
}

async function updateDispatchItem(req, res) {
  const storeName = String(req.body?.storeName || '').trim();
  const productCode = String(req.body?.productCode || '').trim();
  const dispatchItem = req.body?.dispatchItem;
  try {
    const day = await prisma.productionPlanningDay.findUnique({ where: { day: req.params.day }, include: planningInclude });
    if (!day) throw new PlanningError(404, 'Planejamento nao encontrado.');
    if (!editableStatuses.has(day.status)) throw new PlanningError(409, 'O despacho finalizado nao pode ser alterado.');
    const store = day.stores.find((item) => item.storeName === storeName);
    const item = store?.products.find((product) => product.code === productCode);
    if (!item) throw new PlanningError(404, 'Produto do planejamento nao encontrado.');
    if (!isDispatchableItem(item)) throw new PlanningError(409, 'Produtos com quantidade zero nao entram no despacho.');

    let data = { dispatchStatus: null, actualQuantity: null, justification: '' };
    if (dispatchItem !== null && dispatchItem !== undefined) {
      const status = String(dispatchItem.status || '');
      if (!dispatchStatuses.has(status)) throw new PlanningError(400, 'Marcacao de despacho invalida.');
      if (status === 'incomplete') {
        const actualQuantity = toNumber(dispatchItem.actualQuantity, 'Quantidade real');
        const justification = String(dispatchItem.justification || '').trim();
        if (!Number.isInteger(actualQuantity) || !justification) {
          throw new PlanningError(400, 'Quantidade real inteira e justificativa sao obrigatorias.');
        }
        data = { dispatchStatus: status, actualQuantity, justification };
      } else {
        data = { dispatchStatus: status, actualQuantity: null, justification: '' };
      }
    }
    await prisma.productionPlanningItem.update({ where: { id: item.id }, data });
    const updated = await prisma.productionPlanningDay.findUnique({ where: { id: day.id }, include: planningInclude });
    return res.json(serializePlanningDay(updated));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel atualizar o despacho.');
  }
}

async function updateDispatchItemsBulk(req, res) {
  const storeName = String(req.body?.storeName || '').trim();
  const complete = req.body?.complete;
  try {
    if (typeof complete !== 'boolean') throw new PlanningError(400, 'Informe a marcacao dos produtos.');
    const day = await prisma.productionPlanningDay.findUnique({ where: { day: req.params.day }, include: planningInclude });
    if (!day) throw new PlanningError(404, 'Planejamento nao encontrado.');
    if (!editableStatuses.has(day.status)) throw new PlanningError(409, 'O despacho finalizado nao pode ser alterado.');
    const store = day.stores.find((item) => item.storeName === storeName);
    if (!store) throw new PlanningError(404, 'Loja do planejamento nao encontrada.');
    const itemIds = store.products.filter(isDispatchableItem).map((item) => item.id);
    if (!itemIds.length) throw new PlanningError(409, 'A loja nao possui produtos para despachar.');

    await prisma.productionPlanningItem.updateMany({
      where: { id: { in: itemIds } },
      data: complete
        ? { dispatchStatus: 'complete', actualQuantity: null, justification: '' }
        : { dispatchStatus: null, actualQuantity: null, justification: '' },
    });
    const updated = await prisma.productionPlanningDay.findUnique({ where: { id: day.id }, include: planningInclude });
    return res.json(serializePlanningDay(updated));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel atualizar os produtos do despacho.');
  }
}

async function finalizePlanning(req, res) {
  try {
    const day = await prisma.productionPlanningDay.findUnique({ where: { day: req.params.day }, include: planningInclude });
    if (!day) throw new PlanningError(404, 'Planejamento nao encontrado.');
    if (day.status === 'finalizado') return res.json(serializePlanningDay(day));
    assertCanFinalizeProduction(day);
    const items = day.stores.flatMap((store) => store.products).filter(isDispatchableItem);
    if (!items.length || items.some((item) => !dispatchStatuses.has(item.dispatchStatus))) {
      throw new PlanningError(409, 'Marque todos os produtos antes de finalizar a expedicao.');
    }
    const finishedAt = new Date();
    const updateResult = await prisma.productionPlanningDay.updateMany({
      where: { id: day.id, status: 'em_producao', productionFinishedAt: null },
      data: { status: 'finalizado', productionFinishedAt: finishedAt },
    });
    if (updateResult.count !== 1) {
      const current = await prisma.productionPlanningDay.findUnique({
        where: { id: day.id }, include: planningInclude,
      });
      if (current?.status === 'finalizado') return res.json(serializePlanningDay(current));
      throw new PlanningError(409, 'Nao foi possivel finalizar a expedicao porque o status foi alterado.');
    }
    const updated = await prisma.productionPlanningDay.findUnique({
      where: { id: day.id }, include: planningInclude,
    });
    return res.json(serializePlanningDay(updated));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel finalizar a expedicao.');
  }
}

function handleError(res, error, fallback) {
  if (error instanceof PlanningError) {
    return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return res.status(409).json({ error: 'Ja existe planejamento para uma ou mais datas.' });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

module.exports = {
  assertCanFinalizeProduction,
  assertCanStartProduction,
  comparisonServesDay,
  createPlanning,
  finalizePlanning,
  getPlanning,
  isDispatchableItem,
  itemFingerprint,
  getProductionElapsedSeconds,
  listPlanning,
  normalizeStores,
  serializePlanningDay,
  updateDispatchItem,
  updateDispatchItemsBulk,
  updatePlanning,
  updatePlanningStatus,
};
