const { PrismaClient, Prisma } = require('@prisma/client');
const { hasAtMostFourDecimalPlaces, normalizeDecimalText } = require('../utils/decimal');

const prisma = new PrismaClient();
const stockCountRoles = new Set(['store', 'admin', 'production_manager']);
const globalStockCountRoles = new Set(['admin', 'production_manager']);

class StockCountError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const detailInclude = {
  items: { orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }] },
};

function selectStockCountProducts(products) {
  const productsByCode = new Map(
    (products || [])
      .map((product) => [String(product?.code || '').trim(), product])
      .filter(([code]) => code)
  );
  return Array.from(productsByCode.values()).sort((left, right) =>
    String(left?.name || '').localeCompare(String(right?.name || ''), 'pt-BR', { sensitivity: 'base' }) ||
    String(left?.code || '').localeCompare(String(right?.code || ''), 'pt-BR', { numeric: true })
  );
}

function getStockDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parsePositiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new StockCountError(400, `${field} invalido.`);
  return id;
}

function parseQuantity(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(normalizeDecimalText(value));
  if (!hasAtMostFourDecimalPlaces(value) || !Number.isFinite(number) || number < 0) {
    throw new StockCountError(400, 'A quantidade deve ser zero ou positiva e ter no maximo quatro casas decimais.');
  }
  return number;
}

function decimalToNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeCount(count) {
  return {
    id: count.id,
    productionStoreId: count.productionStoreId,
    storeName: count.storeName,
    stockDate: count.stockDate,
    status: count.status,
    productCount: count._count?.items ?? count.items?.length ?? 0,
    createdById: count.createdById,
    createdByName: count.createdByName,
    finalizedAt: count.finalizedAt,
    createdAt: count.createdAt,
    updatedAt: count.updatedAt,
    ...(count.items ? {
      items: count.items.map((item) => ({
        id: item.id,
        productionProductId: item.productionProductId,
        code: item.code,
        name: item.name,
        quantity: decimalToNumber(item.quantity),
        updatedAt: item.updatedAt,
      })),
    } : {}),
  };
}

function canAccessCount(user, count) {
  if (globalStockCountRoles.has(user?.role)) return true;
  return user?.role === 'store'
    && Number(user.productionStoreId) === Number(count.productionStoreId);
}

async function getAccessibleCount(id, user, include = detailInclude) {
  const count = await prisma.stockCount.findUnique({ where: { id }, include });
  if (!count) throw new StockCountError(404, 'Contagem nao encontrada.');
  if (!canAccessCount(user, count)) throw new StockCountError(403, 'Acesso negado a esta contagem.');
  return count;
}

async function resolveCreationStore(user, rawStoreId) {
  if (!stockCountRoles.has(user?.role)) throw new StockCountError(403, 'Acesso negado.');
  const storeId = user.role === 'store'
    ? Number(user.productionStoreId)
    : parsePositiveId(rawStoreId, 'Loja');
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new StockCountError(403, 'O usuario nao possui uma loja vinculada.');
  }
  const store = await prisma.productionStore.findFirst({ where: { id: storeId, active: true } });
  if (!store) throw new StockCountError(409, 'A loja vinculada esta inativa ou nao existe.');
  return store;
}

async function listStockCounts(req, res) {
  try {
    if (!stockCountRoles.has(req.user?.role)) throw new StockCountError(403, 'Acesso negado.');
    const where = req.user.role === 'store'
      ? { productionStoreId: Number(req.user.productionStoreId) || -1 }
      : {};
    const counts = await prisma.stockCount.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: [{ stockDate: 'desc' }, { createdAt: 'desc' }],
    });
    return res.json(counts.map(serializeCount));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel listar as contagens.');
  }
}

async function listStockCountStores(req, res) {
  try {
    if (!stockCountRoles.has(req.user?.role)) throw new StockCountError(403, 'Acesso negado.');
    const where = req.user.role === 'store'
      ? { id: Number(req.user.productionStoreId) || -1, active: true }
      : { active: true };
    const stores = await prisma.productionStore.findMany({
      where,
      select: { id: true, displayName: true, active: true },
      orderBy: { displayName: 'asc' },
    });
    return res.json(stores);
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel listar as lojas.');
  }
}

async function createStockCount(req, res) {
  let store;
  let stockDate;
  try {
    store = await resolveCreationStore(req.user, req.body?.productionStoreId);
    stockDate = getStockDate();
    const existing = await prisma.stockCount.findUnique({
      where: { productionStoreId_stockDate: { productionStoreId: store.id, stockDate } },
      include: detailInclude,
    });
    if (existing) {
      if (existing.status === 'finalized') {
        throw new StockCountError(409, 'A contagem desta loja ja foi finalizada hoje.', { countId: existing.id });
      }
      return res.json(serializeCount(existing));
    }

    const activeProducts = await prisma.productionProduct.findMany({
      where: { active: true, showInStockCount: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
    const products = selectStockCountProducts(activeProducts);
    if (!products.length) throw new StockCountError(409, 'Nao existem produtos ativos para contar.');

    const count = await prisma.stockCount.create({
      data: {
        productionStoreId: store.id,
        storeName: store.displayName,
        stockDate,
        createdById: req.user.id,
        createdByName: req.user.name,
        items: {
          create: products.map((product) => ({
            productionProductId: product.id,
            code: product.code,
            name: product.name,
          })),
        },
      },
      include: detailInclude,
    });
    return res.status(201).json(serializeCount(count));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && store && stockDate) {
      const existing = await prisma.stockCount.findUnique({
        where: { productionStoreId_stockDate: { productionStoreId: store.id, stockDate } },
        include: detailInclude,
      });
      if (existing?.status === 'draft') return res.json(serializeCount(existing));
      return res.status(409).json({
        error: 'A contagem desta loja ja foi finalizada hoje.',
        ...(existing ? { countId: existing.id } : {}),
      });
    }
    return handleError(res, error, 'Nao foi possivel iniciar a contagem.');
  }
}

async function getStockCount(req, res) {
  try {
    const id = parsePositiveId(req.params.id, 'Contagem');
    return res.json(serializeCount(await getAccessibleCount(id, req.user)));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel carregar a contagem.');
  }
}

async function updateStockCountItem(req, res) {
  try {
    const countId = parsePositiveId(req.params.id, 'Contagem');
    const itemId = parsePositiveId(req.params.itemId, 'Item');
    const count = await getAccessibleCount(countId, req.user, { items: { select: { id: true } } });
    if (count.status !== 'draft') throw new StockCountError(409, 'Contagens finalizadas nao podem ser alteradas.');
    if (!count.items.some((item) => item.id === itemId)) throw new StockCountError(404, 'Item da contagem nao encontrado.');
    const quantity = parseQuantity(req.body?.quantity);
    const item = await prisma.stockCountItem.update({ where: { id: itemId }, data: { quantity } });
    return res.json({ id: item.id, quantity: decimalToNumber(item.quantity), updatedAt: item.updatedAt });
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel salvar a quantidade.');
  }
}

async function finalizeStockCount(req, res) {
  try {
    const id = parsePositiveId(req.params.id, 'Contagem');
    const count = await getAccessibleCount(id, req.user);
    if (count.status === 'finalized') return res.json(serializeCount(count));

    await prisma.$transaction(async (tx) => {
      await tx.stockCountItem.updateMany({
        where: { stockCountId: id, quantity: null },
        data: { quantity: 0 },
      });
      await tx.stockCount.update({
        where: { id },
        data: { status: 'finalized', finalizedAt: new Date() },
      });
    });
    const updated = await prisma.stockCount.findUnique({ where: { id }, include: detailInclude });
    return res.json(serializeCount(updated));
  } catch (error) {
    return handleError(res, error, 'Nao foi possivel finalizar a contagem.');
  }
}

function handleError(res, error, fallback) {
  if (error instanceof StockCountError) {
    return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

module.exports = {
  canAccessCount,
  createStockCount,
  finalizeStockCount,
  getStockCount,
  getStockDate,
  listStockCounts,
  listStockCountStores,
  parseQuantity,
  selectStockCountProducts,
  updateStockCountItem,
};
