const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStockSnapshotFromRows,
  getEverestStockDate,
  getEverestStockSnapshot,
} = require('../services/everestDatabase');
const { calculateProductionSuggestion } = require('../controllers/productionPlanningController');

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
