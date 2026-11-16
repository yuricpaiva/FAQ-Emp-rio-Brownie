const { PrismaClient, Prisma } = require('@prisma/client');
const {
  getProductPurchaseHistory,
  searchProducts,
  searchSuppliers
} = require('../services/everestPurchaseDatabase');

const prisma = new PrismaClient();
const ACTIVE_STATUS = 'ACTIVE';
const CANCELLED_STATUS = 'CANCELLED';
const MAX_CENTS = 1_000_000_000;
const EVEREST_SOURCE = 'EVEREST';
const MANUAL_SUPPLIER_SOURCE = 'MANUAL_CNPJ';
const MANUAL_PRODUCT_SOURCE = 'MANUAL';
const orderInclude = {
  buyer: { select: { id: true, name: true, email: true } },
  cancelledBy: { select: { id: true, name: true, email: true } },
  items: { orderBy: { id: 'asc' } },
  additions: { orderBy: { id: 'asc' } }
};

function cleanText(value, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeCnpj(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : cleanText(value, 30);
}

function isValidCnpj(value) {
  const digits = normalizeCnpj(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (length) => {
    let weight = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

function normalizeComparison(value) {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function normalizeQuantity(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) return null;
  return raw.replace(/^0+(?=\d)/, '');
}

function calculateSubtotalCents(quantity, unitPriceCents) {
  const [whole, fraction = ''] = quantity.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const units = BigInt(`${whole}${fraction}`);
  return Number((units * BigInt(unitPriceCents) + scale / 2n) / scale);
}

function parseOrderInput(body) {
  const supplier = body?.supplier;
  const supplierSource = cleanText(supplier?.source, 30) || EVEREST_SOURCE;
  if (!supplier || ![EVEREST_SOURCE, MANUAL_SUPPLIER_SOURCE].includes(supplierSource)) {
    return { error: 'Selecione um fornecedor válido.' };
  }
  const supplierCnpjDigits = normalizeCnpj(supplier.cnpj);
  if (supplierSource === MANUAL_SUPPLIER_SOURCE && !isValidCnpj(supplierCnpjDigits)) {
    return { error: 'Informe um CNPJ válido para o fornecedor não cadastrado.' };
  }
  if (supplierSource === EVEREST_SOURCE && (!cleanText(supplier.id) || !cleanText(supplier.name))) {
    return { error: 'Selecione um fornecedor válido.' };
  }
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return { error: 'Adicione pelo menos um produto.' };
  }

  const seenProducts = new Set();
  const seenManualProducts = new Set();
  const items = [];
  for (const raw of body.items) {
    const productId = cleanText(raw?.productId);
    const productSource = cleanText(raw?.productSource, 30) || EVEREST_SOURCE;
    const quantity = normalizeQuantity(raw?.quantity);
    const unitPriceCents = Number(raw?.unitPriceCents);
    const supplierUnit = raw?.supplierUnit;
    if (!productId || ![EVEREST_SOURCE, MANUAL_PRODUCT_SOURCE].includes(productSource)) return { error: 'Selecione um produto válido.' };
    if (!quantity) return { error: 'Informe uma quantidade válida, com até quatro casas decimais.' };
    if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0 || unitPriceCents > MAX_CENTS) {
      return { error: 'Informe um valor unitário válido.' };
    }
    const description = cleanText(raw?.description, 240);
    const unitId = cleanText(supplierUnit?.id);
    const unitLabel = cleanText(supplierUnit?.label, 120);
    if (!description || !unitId || !unitLabel || (productSource === EVEREST_SOURCE && !cleanText(raw?.code))) {
      return { error: 'Os dados do produto ou da unidade estão incompletos.' };
    }
    if (productSource === MANUAL_PRODUCT_SOURCE) {
      const manualKey = `${normalizeComparison(description)}::${normalizeComparison(unitLabel)}`;
      if (seenManualProducts.has(manualKey)) return { error: 'Este produto avulso já está no pedido.' };
      seenManualProducts.add(manualKey);
    } else {
      if (seenProducts.has(productId)) return { error: 'Cada produto pode aparecer apenas uma vez no pedido.' };
      seenProducts.add(productId);
    }
    items.push({
      productId,
      productSource,
      everestProductId: productSource === EVEREST_SOURCE ? cleanText(raw.everestProductId) : '',
      code: cleanText(raw.code, 80),
      description,
      quantity,
      supplierUnitId: unitId,
      supplierUnitEverestId: productSource === EVEREST_SOURCE ? cleanText(supplierUnit.everestId) : '',
      supplierUnitCode: cleanText(supplierUnit.code, 40),
      supplierUnitLabel: unitLabel,
      unitPriceCents,
      subtotalCents: calculateSubtotalCents(quantity, unitPriceCents)
    });
  }

  const additions = [];
  for (const raw of Array.isArray(body?.additions) ? body.additions : []) {
    const description = cleanText(raw?.description, 160);
    const amountCents = Number(raw?.amountCents);
    if (!description && !amountCents) continue;
    if (!description || !Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) {
      return { error: 'Preencha a descrição e um valor válido para cada acréscimo.' };
    }
    additions.push({ description, amountCents });
  }

  const productSubtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
  const additionsTotalCents = additions.reduce((sum, item) => sum + item.amountCents, 0);
  const totalCents = productSubtotalCents + additionsTotalCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_CENTS) return { error: 'O total do pedido excede o limite permitido.' };

  return {
    supplier: {
      supplierId: supplierSource === MANUAL_SUPPLIER_SOURCE ? `cnpj:${supplierCnpjDigits}` : cleanText(supplier.id),
      supplierSource,
      supplierEverestId: supplierSource === EVEREST_SOURCE ? cleanText(supplier.everestId) : '',
      supplierName: supplierSource === MANUAL_SUPPLIER_SOURCE ? 'Fornecedor não cadastrado no Everest' : cleanText(supplier.name, 160),
      supplierLegalName: supplierSource === EVEREST_SOURCE ? cleanText(supplier.legalName, 200) : '',
      supplierCnpj: supplierSource === MANUAL_SUPPLIER_SOURCE ? formatCnpj(supplierCnpjDigits) : cleanText(supplier.cnpj, 30)
    },
    items,
    additions,
    totals: { productSubtotalCents, additionsTotalCents, totalCents }
  };
}

function orderPayload(order) {
  return {
    id: String(order.id),
    number: order.number,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt,
    buyer: order.buyer,
    cancelledBy: order.cancelledBy,
    supplier: {
      id: order.supplierId,
      source: order.supplierSource,
      everestId: order.supplierEverestId,
      name: order.supplierName,
      legalName: order.supplierLegalName,
      cnpj: order.supplierCnpj
    },
    items: order.items.map((item) => ({
      id: String(item.id),
      productId: item.productId,
      productSource: item.productSource,
      everestProductId: item.everestProductId,
      code: item.code,
      description: item.description,
      quantity: String(item.quantity),
      supplierUnit: {
        id: item.supplierUnitId,
        everestId: item.supplierUnitEverestId,
        code: item.supplierUnitCode,
        label: item.supplierUnitLabel
      },
      unitPriceCents: item.unitPriceCents,
      subtotalCents: item.subtotalCents
    })),
    additions: order.additions.map((addition) => ({
      id: String(addition.id),
      description: addition.description,
      amountCents: addition.amountCents
    })),
    signatureRequirement: order.signatureLabel
      ? { label: order.signatureLabel, thresholdCents: order.signatureThresholdCents || 0 }
      : null,
    productSubtotalCents: order.productSubtotalCents,
    additionsTotalCents: order.additionsTotalCents,
    totalCents: order.totalCents
  };
}

async function signatureForTotal(tx, totalCents) {
  const settings = await tx.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const label = cleanText(settings.purchaseSignatureLabel, 80);
  const threshold = Number(settings.purchaseSignatureThresholdCents) || 0;
  return threshold > 0 && label && totalCents >= threshold
    ? { signatureLabel: label, signatureThresholdCents: threshold }
    : { signatureLabel: null, signatureThresholdCents: null };
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    gte: new Date(`${year}-${String(monthNumber).padStart(2, '0')}-01T00:00:00-03:00`),
    lt: new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00-03:00`)
  };
}

async function access(req, res) {
  return res.json({ hasAccess: true, canManage: req.user.role === 'admin' });
}

function purchaseSourceError(res, error) {
  console.error('Falha ao consultar a base de compras do Everest:', error);
  return res.status(503).json({ error: 'A base de compras do Everest está indisponível no momento.' });
}

async function suppliers(req, res) {
  try {
    return res.json(await searchSuppliers({ query: cleanText(req.query.query, 120) }));
  } catch (error) {
    return purchaseSourceError(res, error);
  }
}

async function products(req, res) {
  try {
    const supplierId = cleanText(req.query.supplierId, 80);
    return res.json(await searchProducts({ supplierId, query: cleanText(req.query.query, 120) }));
  } catch (error) {
    return purchaseSourceError(res, error);
  }
}

async function list(req, res, next) {
  try {
    const where = {};
    const range = monthRange(req.query.month);
    if (req.query.month && !range) return res.status(400).json({ error: 'Informe um mês válido.' });
    if (range) where.createdAt = range;
    if (req.query.number) where.number = { contains: cleanText(req.query.number, 50) };
    if (req.query.supplierId) where.supplierId = cleanText(req.query.supplierId);
    if (req.query.buyerId) {
      const buyerId = Number(req.query.buyerId);
      if (!Number.isInteger(buyerId)) return res.status(400).json({ error: 'Comprador inválido.' });
      where.buyerId = buyerId;
    }
    if (req.query.productId) where.items = { some: { productId: cleanText(req.query.productId) } };
    if ([ACTIVE_STATUS, CANCELLED_STATUS].includes(req.query.status)) where.status = req.query.status;

    const [orders, totalStored, buyers] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' } }),
      prisma.purchaseOrder.count(),
      prisma.user.findMany({
        where: { purchaseOrdersCreated: { some: {} } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' }
      })
    ]);
    return res.json({ orders: orders.map(orderPayload), totalStored, buyers });
  } catch (error) {
    return next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    return res.json(orderPayload(order));
  } catch (error) {
    return next(error);
  }
}

async function createAttempt(input, buyerId) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const prefix = `PC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const latest = await tx.purchaseOrder.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
    const sequence = (latest ? Number(latest.number.slice(prefix.length)) || 0 : 0) + 1;
    const signature = await signatureForTotal(tx, input.totals.totalCents);
    return tx.purchaseOrder.create({
      data: {
        number: `${prefix}${String(sequence).padStart(4, '0')}`,
        buyerId,
        ...input.supplier,
        ...input.totals,
        ...signature,
        items: { create: input.items },
        additions: { create: input.additions }
      },
      include: orderInclude
    });
  });
}

async function create(req, res, next) {
  try {
    const input = parseOrderInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const order = await createAttempt(input, req.user.id);
        return res.status(201).json(orderPayload(order));
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || attempt === 2) throw error;
      }
    }
    return res.status(409).json({ error: 'Não foi possível gerar um número único para o pedido.' });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const input = parseOrderInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (existing.status === CANCELLED_STATUS) return res.status(409).json({ error: 'Pedidos cancelados não podem ser editados.' });

    const order = await prisma.$transaction(async (tx) => {
      const signature = await signatureForTotal(tx, input.totals.totalCents);
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });
      await tx.purchaseOrderAddition.deleteMany({ where: { orderId: id } });
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...input.supplier,
          ...input.totals,
          ...signature,
          items: { create: input.items },
          additions: { create: input.additions }
        },
        include: orderInclude
      });
    });
    return res.json(orderPayload(order));
  } catch (error) {
    return next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (existing.status === CANCELLED_STATUS) return res.status(409).json({ error: 'Este pedido já está cancelado.' });
    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: CANCELLED_STATUS, cancelledAt: new Date(), cancelledById: req.user.id },
      include: orderInclude
    });
    return res.json(orderPayload(order));
  } catch (error) {
    return next(error);
  }
}

async function history(req, res, next) {
  try {
    const supplierId = cleanText(req.query.supplierId);
    const productId = cleanText(req.query.productId);
    const limit = Math.min(10, Math.max(0, Math.floor(Number(req.query.limit) || 2)));
    if (!supplierId || !productId) return res.json([]);
    return res.json(await getProductPurchaseHistory({ supplierId, productId, limit }));
  } catch (error) {
    return purchaseSourceError(res, error);
  }
}

module.exports = { access, suppliers, products, list, get, create, update, cancel, history };
