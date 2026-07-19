const test = require('node:test');
const assert = require('node:assert/strict');

const {
  comparisonServesDay,
  itemFingerprint,
  normalizeStores,
} = require('../controllers/productionPlanningPersistenceController');

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

test('planning item fingerprint changes only when planning data changes', () => {
  const original = buildProduct();
  assert.equal(itemFingerprint(original), itemFingerprint({ ...original }));
  assert.notEqual(itemFingerprint(original), itemFingerprint({ ...original, suggestion: 13 }));
  assert.notEqual(itemFingerprint(original), itemFingerprint({
    ...original,
    servedDates: [...original.servedDates, '2026-07-15'],
  }));
});
