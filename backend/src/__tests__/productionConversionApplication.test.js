const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildConversionContext,
  convertOrderItems,
  convertSalesRows,
  convertStockItems,
  getRequiredStockCodes,
} = require('../services/productionConversionService');
const { validateConversionConfiguration } = require('../controllers/productionConversionController');

function context() {
  const products = [
    { code: 'KIT6', name: 'Kit 6 brigadeiros' },
    { code: 'KIT3', name: 'Kit 3 brigadeiros' },
    { code: 'BRIG', name: 'Brigadeiro' },
  ];
  const conversions = [
    { sourceProduct: products[0], conversionCode: 'BRIG', conversionName: 'Brigadeiro', conversionFactor: 6 },
    { sourceProduct: products[1], conversionCode: 'BRIG', conversionName: 'Brigadeiro', conversionFactor: 3 },
  ];
  return buildConversionContext(products, conversions);
}

test('sales replace source kits and aggregate direct sales in the final product', () => {
  const rows = convertSalesRows([
    { store_name: 'Loja A', sale_date: '2026-07-01', codigo_produto: 'KIT6', quantidade_total: 5 },
    { store_name: 'Loja A', sale_date: '2026-07-01', codigo_produto: 'KIT3', quantidade_total: 2 },
    { store_name: 'Loja A', sale_date: '2026-07-01', codigo_produto: 'BRIG', quantidade_total: 4 },
    { store_name: 'Loja A', sale_date: '2026-07-01', codigo_produto: 'BRIG', quantidade_total: 3 },
    { store_name: 'Loja B', sale_date: '2026-07-01', codigo_produto: 'KIT6', quantidade_total: 1 },
  ], context());

  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.store_name === 'Loja A').quantidade_total, 43);
  assert.equal(rows.find((row) => row.store_name === 'Loja B').quantidade_total, 6);
  assert.equal(rows.some((row) => row.codigo_produto.startsWith('KIT')), false);
});

test('orders preserve fixed and order quantities separately with source composition', () => {
  const items = convertOrderItems([
    { code: 'KIT6', name: 'Kit 6 brigadeiros', fixedQuantity: 2, orderQuantity: 1 },
    { code: 'BRIG', name: 'Brigadeiro', fixedQuantity: 1, orderQuantity: 2 },
  ], context());

  assert.equal(items.length, 1);
  assert.equal(items[0].code, 'BRIG');
  assert.equal(items[0].fixedQuantity, 13);
  assert.equal(items[0].orderQuantity, 8);
  assert.equal(items[0].sources.length, 2);
});

test('stock combines direct and converted balances and exposes required source codes', () => {
  const conversionContext = context();
  assert.deepEqual(getRequiredStockCodes(['BRIG'], conversionContext), ['BRIG', 'KIT6', 'KIT3']);
  const [stock] = convertStockItems([
    { code: 'BRIG', quantity: 4, status: 'available' },
    { code: 'KIT6', quantity: 2, status: 'available' },
    { code: 'KIT3', quantity: 1, status: 'available' },
  ], ['BRIG'], conversionContext);

  assert.equal(stock.quantity, 19);
  assert.equal(stock.status, 'available');
});

test('one invalid stock component makes the converted balance unavailable', () => {
  const [stock] = convertStockItems([
    { code: 'BRIG', quantity: 4, status: 'available' },
    { code: 'KIT6', quantity: null, status: 'duplicate', reason: 'Duplicado' },
    { code: 'KIT3', quantity: 0, status: 'not_found' },
  ], ['BRIG'], context());

  assert.equal(stock.quantity, null);
  assert.equal(stock.status, 'unavailable');
  assert.match(stock.reason, /KIT6/);
});

test('conversion configuration rejects self conversion, chains and inconsistent target names', () => {
  const products = [{ id: 1, code: 'A' }, { id: 2, code: 'B' }];
  assert.match(validateConversionConfiguration([
    { sourceProductId: 1, conversionCode: 'A', conversionName: 'A' },
  ], products), /diferentes/);
  assert.match(validateConversionConfiguration([
    { sourceProductId: 1, conversionCode: 'B', conversionName: 'B' },
    { sourceProductId: 2, conversionCode: 'C', conversionName: 'C' },
  ], products), /encadeadas/);
  assert.match(validateConversionConfiguration([
    { sourceProductId: 1, conversionCode: 'C', conversionName: 'Destino C' },
    { sourceProductId: 2, conversionCode: 'C', conversionName: 'Outro nome' },
  ], products), /mesmo nome/);
  assert.equal(validateConversionConfiguration([
    { sourceProductId: 1, conversionCode: 'C', conversionName: 'Destino C' },
    { sourceProductId: 2, conversionCode: 'C', conversionName: 'Destino C' },
  ], products), '');
});
