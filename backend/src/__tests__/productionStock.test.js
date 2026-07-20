const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const {
  buildStockSnapshotFromRows,
  getEverestStockDate,
  getEverestStockSnapshot,
} = require('../services/everestDatabase');
const { buildConversionContext, convertStockItems } = require('../services/productionConversionService');
const {
  buildImportedStockSnapshot,
  calculateProductionSuggestion,
  getFaqStockSnapshot,
  normalizeImportedStock,
  normalizeStockSource,
} = require('../controllers/productionPlanningController');

const prisma = new PrismaClient();

test('Everest stock rows preserve valid balances and classify missing, duplicate and negative values', () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const snapshot = buildStockSnapshotFromRows({
      stockDate: '2026-07-16',
      stores: ['Loja A'],
      productCodes: ['100', '200', '300', '400'],
      rows: [
        { fantasia: 'Loja A', cd_item: '100', qt_saldo: '5.5' },
        { fantasia: 'Loja A', cd_item: '300', qt_saldo: 2 },
        { fantasia: 'Loja A', cd_item: '300', qt_saldo: 3 },
        { fantasia: 'Loja A', cd_item: '400', qt_saldo: -1 },
      ],
    });

    assert.deepEqual(snapshot.items['Loja A']['100'], { quantity: 5.5, status: 'available', reason: '' });
    assert.deepEqual(snapshot.items['Loja A']['200'], { quantity: 0, status: 'not_found', reason: '' });
    assert.equal(snapshot.items['Loja A']['300'].status, 'duplicate');
    assert.equal(snapshot.items['Loja A']['300'].quantity, null);
    assert.equal(snapshot.items['Loja A']['400'].status, 'unavailable');
    assert.equal(snapshot.items['Loja A']['400'].quantity, null);
    assert.equal(snapshot.status, 'partial');
    assert.equal(snapshot.warnings.length, 2);
  } finally {
    console.warn = originalWarn;
  }
});

test('production suggestion deducts valid stock from the total after increase and additions', () => {
  const availableStock = { quantity: 4, status: 'available' };
  const unavailableStock = { quantity: null, status: 'unavailable' };

  assert.equal(calculateProductionSuggestion({
    averageSold: 10,
    increasePercent: 10,
    fixedQuantity: 2,
    orderQuantity: 1,
    stockItem: availableStock,
  }), 10);
  assert.equal(calculateProductionSuggestion({
    averageSold: 10,
    increasePercent: 10,
    fixedQuantity: 2,
    orderQuantity: 1,
    stockItem: unavailableStock,
  }), 14);
  assert.equal(calculateProductionSuggestion({
    averageSold: 2,
    stockItem: { quantity: 20, status: 'available' },
  }), 0);
});

test('Everest stock date uses the configured business timezone', () => {
  const originalTimezone = process.env.EVEREST_STOCK_TIMEZONE;
  process.env.EVEREST_STOCK_TIMEZONE = 'America/Fortaleza';
  try {
    assert.equal(getEverestStockDate(new Date('2026-07-16T02:30:00.000Z')), '2026-07-15');
    assert.equal(getEverestStockDate(new Date('2026-07-16T03:30:00.000Z')), '2026-07-16');
  } finally {
    if (originalTimezone === undefined) delete process.env.EVEREST_STOCK_TIMEZONE;
    else process.env.EVEREST_STOCK_TIMEZONE = originalTimezone;
  }
});

test('disabled Everest integration returns unavailable balances without opening a connection', async () => {
  const originalEnabled = process.env.EVEREST_DB_ENABLED;
  process.env.EVEREST_DB_ENABLED = 'false';
  try {
    const snapshot = await getEverestStockSnapshot({
      stockDate: '2026-07-16',
      stores: ['Loja A'],
      productCodes: ['100'],
    });
    assert.equal(snapshot.status, 'unavailable');
    assert.equal(snapshot.items['Loja A']['100'].status, 'unavailable');
    assert.equal(snapshot.items['Loja A']['100'].quantity, null);
  } finally {
    if (originalEnabled === undefined) delete process.env.EVEREST_DB_ENABLED;
    else process.env.EVEREST_DB_ENABLED = originalEnabled;
  }
});

test('imported stock validates the source and fills missing stores and products with zero', () => {
  assert.equal(normalizeStockSource(undefined), 'everest');
  assert.equal(normalizeStockSource('faq'), 'faq');
  assert.throws(() => normalizeStockSource('unknown'), /origem de estoque valida/);
  assert.throws(() => normalizeImportedStock({ stockDate: 'invalid', stores: [] }), /arquivo de estoque valido/);
  assert.throws(() => normalizeImportedStock({
    stockDate: '2026-07-19',
    stores: [{ displayName: 'Loja A', items: [{ code: '100', quantity: '1,23456' }] }],
  }), /quatro casas/);
  assert.throws(() => normalizeImportedStock({
    stockDate: '2026-07-19',
    stores: [{ displayName: 'Loja A', items: [{ code: '100', quantity: '1.23000' }] }],
  }), /quatro casas/);

  const snapshot = buildImportedStockSnapshot({
    importedStock: {
      stockDate: '2026-07-19',
      stores: [
        { displayName: 'Loja A', items: [{ code: '100', quantity: 2.5 }] },
        { displayName: 'Loja ignorada', items: [{ code: '100', quantity: 8 }] },
      ],
    },
    stores: [{ id: 1, displayName: 'Loja A' }, { id: 2, displayName: 'Loja B' }],
    productCodes: ['100', '200'],
  });

  assert.deepEqual(snapshot.items['Loja A']['100'], { code: '100', quantity: 2.5, status: 'available', reason: '' });
  assert.equal(snapshot.items['Loja A']['200'].quantity, 0);
  assert.equal(snapshot.items['Loja A']['200'].status, 'not_found');
  assert.equal(snapshot.items['Loja B']['100'].quantity, 0);
  assert.match(snapshot.warnings.join(' '), /Loja B/);
  assert.match(snapshot.warnings.join(' '), /nao fazem parte/);
});

test('FAQ stock uses the latest finalized count and ignores a newer draft', async (t) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const store = await prisma.productionStore.create({
    data: { sourceCode: `FAQ-STOCK-${suffix}`, sourceName: `FAQ Stock ${suffix}`, displayName: `Loja FAQ ${suffix}` },
  });
  const product = await prisma.productionProduct.create({
    data: { code: `FAQ-${suffix}`, name: `Produto FAQ ${suffix}` },
  });
  const user = await prisma.user.create({
    data: { name: 'Contador FAQ', email: `faq-stock-${suffix}@test.local`, passwordHash: 'test', role: 'store', productionStoreId: store.id },
  });
  const finalized = await prisma.stockCount.create({
    data: {
      productionStoreId: store.id,
      storeName: store.displayName,
      stockDate: '2026-07-18',
      status: 'finalized',
      finalizedAt: new Date('2026-07-18T15:00:00.000Z'),
      createdById: user.id,
      createdByName: user.name,
      items: { create: [{ productionProductId: product.id, code: product.code, name: product.name, quantity: 3.25 }] },
    },
  });
  const draft = await prisma.stockCount.create({
    data: {
      productionStoreId: store.id,
      storeName: store.displayName,
      stockDate: '2026-07-19',
      status: 'draft',
      createdById: user.id,
      createdByName: user.name,
      items: { create: [{ productionProductId: product.id, code: product.code, name: product.name, quantity: 9 }] },
    },
  });

  t.after(async () => {
    await prisma.stockCount.deleteMany({ where: { id: { in: [finalized.id, draft.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.productionProduct.delete({ where: { id: product.id } });
    await prisma.productionStore.delete({ where: { id: store.id } });
  });

  const snapshot = await getFaqStockSnapshot({
    stores: [{ id: store.id, displayName: store.displayName }],
    productCodes: [product.code, `MISSING-${suffix}`],
    ignoredMissingProductCodes: [`MISSING-${suffix}`],
  });
  assert.equal(snapshot.stockDates[store.displayName], '2026-07-18');
  assert.equal(snapshot.items[store.displayName][product.code].quantity, 3.25);
  assert.equal(snapshot.items[store.displayName][`MISSING-${suffix}`].quantity, 0);
  assert.equal(snapshot.items[store.displayName][`MISSING-${suffix}`].status, 'not_found');
  assert.doesNotMatch(snapshot.warnings.join(' '), /produto\(s\) ausente\(s\)/);

  const conversionContext = buildConversionContext(
    [product, { code: `MISSING-${suffix}`, name: 'Produto de venda' }],
    [{
      sourceProduct: { code: `MISSING-${suffix}`, name: 'Produto de venda' },
      conversionCode: product.code,
      conversionName: product.name,
      conversionFactor: 8,
    }]
  );
  const [convertedStock] = convertStockItems(
    Object.entries(snapshot.items[store.displayName]).map(([code, item]) => ({ code, ...item })),
    [product.code],
    conversionContext
  );
  assert.equal(convertedStock.quantity, 3.25);
  assert.equal(convertedStock.status, 'available');
});
