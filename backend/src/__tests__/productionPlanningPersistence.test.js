const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCanFinalizeProduction,
  assertCanStartProduction,
  comparisonServesDay,
  getProductionElapsedSeconds,
  isDispatchableItem,
  itemFingerprint,
  normalizeStores,
} = require('../controllers/productionPlanningPersistenceController');

test('production timer returns null before start and counts active elapsed time', () => {
  assert.equal(getProductionElapsedSeconds({ productionStartedAt: null }), null);
  assert.equal(getProductionElapsedSeconds({
    productionStartedAt: new Date('2026-07-21T10:00:00.000Z'),
    productionFinishedAt: null,
  }, new Date('2026-07-21T11:02:03.900Z')), 3723);
});

test('production timer freezes at the persisted finish time', () => {
  const production = {
    productionStartedAt: new Date('2026-07-21T10:00:00.000Z'),
    productionFinishedAt: new Date('2026-07-22T12:15:04.000Z'),
  };
  assert.equal(getProductionElapsedSeconds(production, new Date('2026-07-30T00:00:00.000Z')), 94504);
});

test('production cannot restart, pause, or finalize before starting', () => {
  assert.doesNotThrow(() => assertCanStartProduction({
    status: 'nao_iniciado', productionStartedAt: null,
  }));
  assert.throws(() => assertCanStartProduction({
    status: 'em_producao', productionStartedAt: new Date(),
  }), /ja foi iniciada/);
  assert.throws(() => assertCanStartProduction({
    status: 'nao_iniciado', productionStartedAt: new Date(),
  }), /nao pode ser reiniciado/);
  assert.throws(() => assertCanFinalizeProduction({
    status: 'nao_iniciado', productionStartedAt: null, productionFinishedAt: null,
  }), /Inicie a producao/);
  assert.doesNotThrow(() => assertCanFinalizeProduction({
    status: 'em_producao', productionStartedAt: new Date(), productionFinishedAt: null,
  }));
});

test('dispatch includes only products with a positive production quantity', () => {
  assert.equal(isDispatchableItem({ suggestion: 1 }), true);
  assert.equal(isDispatchableItem({ suggestion: '0.0001' }), true);
  assert.equal(isDispatchableItem({ suggestion: 0 }), false);
  assert.equal(isDispatchableItem({ suggestion: '0' }), false);
  assert.equal(isDispatchableItem({ suggestion: null }), false);
});

test('comparison period must contain the production weekday', () => {
  assert.equal(comparisonServesDay('2026-07-06', '2026-07-08', '2026-07-13'), true);
  assert.equal(comparisonServesDay('2026-07-07', '2026-07-08', '2026-07-13'), false);
});

function buildProduct(overrides = {}) {
  return {
    code: '100',
    name: 'Brownie',
    family: 'Brownies',
    averageSold: 12.5,
    servedDates: ['2026-07-13', '2026-07-14'],
    stockQuantity: 2,
    stockStatus: 'available',
    stockDate: '2026-07-19',
    stockReason: '',
    stockSource: 'everest',
    increasePercent: null,
    fixedQuantity: 1.25,
    orderQuantity: 0.5,
    fixedOrderSources: [{
      code: 'KIT', name: 'Kit', fixedQuantity: 1, orderQuantity: 0.5,
      factor: 1, convertedCode: '100', convertedName: 'Brownie',
    }],
    stockSources: [{
      code: '100', name: 'Brownie', quantity: 2, status: 'available', reason: '',
      factor: 1, convertedQuantity: 2,
    }],
    suggestion: 12.25,
    importedOnly: false,
    ...overrides,
  };
}

test('planning normalization preserves nullable percentages and four decimal quantities', () => {
  const stores = normalizeStores({
    'Loja A': {
      defaultIncreasePercent: '',
      products: [buildProduct({ fixedQuantity: '1,2345', orderQuantity: '0.0001' })],
    },
  });

  assert.equal(stores[0].defaultIncreasePercent, null);
  assert.equal(stores[0].products[0].increasePercent, null);
  assert.equal(stores[0].products[0].fixedQuantity, 1.2345);
  assert.equal(stores[0].products[0].orderQuantity, 0.0001);
  assert.equal(stores[0].products[0].fixedOrderSources[0].code, 'KIT');
  assert.equal(stores[0].products[0].stockSources[0].convertedQuantity, 2);
});

test('planning normalization rejects duplicate products and negative values', () => {
  assert.throws(() => normalizeStores({
    'Loja A': { products: [buildProduct(), buildProduct()] },
  }), /produtos duplicados/);

  assert.throws(() => normalizeStores({
    'Loja A': { products: [buildProduct({ suggestion: -1 })] },
  }), /maior ou igual a zero/);
});

test('planning normalization rejects decimal values with more than four places', () => {
  for (const product of [
    buildProduct({ increasePercent: '10,00001' }),
    buildProduct({ suggestion: '1.23456' }),
    buildProduct({ fixedQuantity: '0.00001' }),
    buildProduct({ stockQuantity: '2.00000' }),
    buildProduct({ fixedOrderSources: [{
      code: 'KIT', name: 'Kit', fixedQuantity: 1, orderQuantity: 0,
      factor: '1.00001', convertedCode: '100', convertedName: 'Brownie',
    }] }),
  ]) {
    assert.throws(() => normalizeStores({
      'Loja A': { defaultIncreasePercent: 0, products: [product] },
    }), /quatro casas/);
  }

  assert.throws(() => normalizeStores({
    'Loja A': { defaultIncreasePercent: '10.00001', products: [buildProduct()] },
  }), /quatro casas/);
});

test('planning item fingerprint changes only when planning data changes', () => {
  const original = buildProduct();
  assert.equal(itemFingerprint(original), itemFingerprint({ ...original }));
  assert.notEqual(itemFingerprint(original), itemFingerprint({ ...original, suggestion: 13 }));
  assert.notEqual(itemFingerprint(original), itemFingerprint({
    ...original,
    servedDates: [...original.servedDates, '2026-07-15'],
  }));
});
