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
  getHiddenStockCountProductCodes,
  getIgnoredFaqStockCodes,
  normalizeImportedStock,
  normalizeStockSource,
} = require('../controllers/productionPlanningController');

const prisma = new PrismaClient();

test('FAQ stock ignores missing warnings for conversion sources and hidden count products', () => {
  const ignoredCodes = getIgnoredFaqStockCodes([
    { code: 'VISIBLE', showInStockCount: true },
    { code: 'HIDDEN', showInStockCount: false },
  ], { sourceCodes: new Set(['CONVERSION-SOURCE']) });
  assert.deepEqual(Array.from(ignoredCodes).sort(), ['CONVERSION-SOURCE', 'HIDDEN']);
  assert.deepEqual(Array.from(getHiddenStockCountProductCodes([
    { code: 'VISIBLE', showInStockCount: true },
    { code: 'HIDDEN', showInStockCount: false },
  ])), ['HIDDEN']);
});

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

test('Everest distinguishes a date without data from missing selected products', async () => {
  const environment = {
    EVEREST_DB_ENABLED: process.env.EVEREST_DB_ENABLED,
    EVEREST_DB_HOST: process.env.EVEREST_DB_HOST,
    EVEREST_DB_NAME: process.env.EVEREST_DB_NAME,
    EVEREST_DB_USER: process.env.EVEREST_DB_USER,
    EVEREST_DB_PASSWORD: process.env.EVEREST_DB_PASSWORD,
  };
  Object.assign(process.env, {
    EVEREST_DB_ENABLED: 'true',
    EVEREST_DB_HOST: 'test.local',
    EVEREST_DB_NAME: 'everest',
    EVEREST_DB_USER: 'test',
    EVEREST_DB_PASSWORD: 'test',
  });

  try {
    let absentDateCalls = 0;
    const absentDate = await getEverestStockSnapshot({
      stockDate: '2026-08-31',
      stores: ['Loja A'],
      productCodes: ['100'],
      database: {
        async execute() {
          absentDateCalls += 1;
          return absentDateCalls === 1 ? [[]] : [[{ row_count: 0 }]];
        },
      },
    });
    assert.equal(absentDateCalls, 2);
    assert.equal(absentDate.status, 'date_unavailable');
    assert.equal(absentDate.dateUnavailable, true);
    assert.equal(absentDate.items['Loja A']['100'].status, 'unavailable');
    assert.match(absentDate.warnings.join(' '), /2026-08-31/);

    let existingDateCalls = 0;
    const missingProduct = await getEverestStockSnapshot({
      stockDate: '2026-08-30',
      stores: ['Loja A'],
      productCodes: ['100'],
      database: {
        async execute() {
          existingDateCalls += 1;
          return existingDateCalls === 1 ? [[]] : [[{ row_count: 12 }]];
        },
      },
    });
    assert.equal(existingDateCalls, 2);
    assert.equal(missingProduct.status, 'available');
    assert.equal(missingProduct.dateUnavailable, false);
    assert.equal(missingProduct.items['Loja A']['100'].status, 'not_found');
  } finally {
    Object.entries(environment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
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
  const conversionSource = await prisma.productionProduct.create({
    data: { code: `FAQ-SOURCE-${suffix}`, name: `Produto de venda FAQ ${suffix}` },
  });
  const user = await prisma.user.create({
    data: { name: 'Contador FAQ', email: `faq-stock-${suffix}@test.local`, passwordHash: 'test', role: 'store', productionStoreId: store.id },
  });
  const olderFinalized = await prisma.stockCount.create({
    data: {
      productionStoreId: store.id,
      storeName: store.displayName,
      stockDate: '2026-07-18',
      status: 'finalized',
      finalizedAt: new Date('2026-07-18T14:00:00.000Z'),
      createdById: user.id,
      createdByName: user.name,
      items: { create: [{ productionProductId: product.id, code: product.code, name: product.name, quantity: 1 }] },
    },
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
    await prisma.stockCount.deleteMany({ where: { id: { in: [olderFinalized.id, finalized.id, draft.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.productionProduct.deleteMany({ where: { id: { in: [product.id, conversionSource.id] } } });
    await prisma.productionStore.delete({ where: { id: store.id } });
  });

  const snapshot = await getFaqStockSnapshot({
    stores: [{ id: store.id, displayName: store.displayName }],
    productCodes: [product.code, conversionSource.code],
    ignoredMissingProductCodes: [conversionSource.code],
  });
  assert.equal(snapshot.stockDates[store.displayName], '2026-07-18');
  assert.equal(snapshot.items[store.displayName][product.code].quantity, 3.25);
  assert.equal(snapshot.items[store.displayName][conversionSource.code].quantity, 0);
  assert.equal(snapshot.items[store.displayName][conversionSource.code].status, 'not_found');
  assert.doesNotMatch(snapshot.warnings.join(' '), /produto\(s\) ausente\(s\)/);

  const conversionContext = buildConversionContext(
    [product, conversionSource],
    [{
      sourceProduct: conversionSource,
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

  const snapshotWithExcludedProduct = await getFaqStockSnapshot({
    stores: [{ id: store.id, displayName: store.displayName }],
    productCodes: [product.code],
    ignoredMissingProductCodes: [product.code],
    excludedProductCodes: [product.code],
  });
  assert.equal(snapshotWithExcludedProduct.items[store.displayName][product.code].quantity, 0);
  assert.equal(snapshotWithExcludedProduct.items[store.displayName][product.code].status, 'not_found');
  assert.doesNotMatch(snapshotWithExcludedProduct.warnings.join(' '), /produto\(s\) ausente\(s\)/);

  await prisma.stockCountItem.create({
    data: {
      stockCountId: finalized.id,
      productionProductId: conversionSource.id,
      code: conversionSource.code,
      name: conversionSource.name,
      quantity: 2,
    },
  });
  const snapshotWithSource = await getFaqStockSnapshot({
    stores: [{ id: store.id, displayName: store.displayName }],
    productCodes: [product.code, conversionSource.code],
    ignoredMissingProductCodes: [conversionSource.code],
  });
  const [stockWithConvertedSource] = convertStockItems(
    Object.entries(snapshotWithSource.items[store.displayName]).map(([code, item]) => ({ code, ...item })),
    [product.code],
    conversionContext
  );
  assert.equal(stockWithConvertedSource.quantity, 19.25);
  assert.equal(stockWithConvertedSource.sources.find((item) => item.code === conversionSource.code).convertedQuantity, 16);
});
