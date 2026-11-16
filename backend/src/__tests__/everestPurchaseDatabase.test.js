const test = require('node:test');
const assert = require('node:assert/strict');
const {
  historyPayload,
  productPayload,
  searchProducts,
  searchSuppliers,
  supplierPayload
} = require('../services/everestPurchaseDatabase');

test('mapeia fornecedor e produto da tabela 505 para o contrato do módulo de compras', () => {
  assert.deepEqual(supplierPayload({ cnpj: '09317318000175', legal_name: 'FORTALI DIST DE ALIMENTOS LTDA' }), {
    id: '09317318000175',
    everestId: '09317318000175',
    source: 'EVEREST',
    name: 'FORTALI DIST DE ALIMENTOS LTDA',
    legalName: 'FORTALI DIST DE ALIMENTOS LTDA',
    cnpj: '09.317.318/0001-75'
  });

  assert.deepEqual(productPayload({
    cnpj: '09317318000175',
    product_id: '103',
    description: 'LEITE CONDENSADO',
    supplier_product_id: '9942',
    packaging: 'UNIDADE 5KG',
    unit_code: 'KG'
  }), {
    id: '103',
    everestId: '103',
    supplierId: '09317318000175',
    productSource: 'EVEREST',
    code: '103',
    description: 'LEITE CONDENSADO',
    supplierCode: '9942',
    unit: { id: '103:KG:UNIDADE 5KG', everestId: '103:KG:UNIDADE 5KG', code: 'KG', label: 'UNIDADE 5KG' }
  });
});

test('mapeia a compra anterior usando quantidade e valor da embalagem', () => {
  assert.deepEqual(historyPayload({
    source_id: 77,
    invoice_number: 1234,
    purchase_date: '2026-11-12',
    product_id: '103',
    packaging: 'UNIDADE 5KG',
    unit_code: 'KG',
    quantity: '240.0000',
    unit_price: '83.90'
  }), {
    orderId: '77',
    orderNumber: 'NF 1234',
    createdAt: '2026-11-12',
    quantity: '240',
    supplierUnit: { id: '103:KG:UNIDADE 5KG', everestId: '103:KG:UNIDADE 5KG', code: 'KG', label: 'UNIDADE 5KG' },
    unitPriceCents: 8390
  });
});

test('normaliza filtros antes de consultar fornecedores e produtos', async () => {
  const calls = [];
  const database = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };
  await searchSuppliers({ query: ' fortali ', database });
  await searchProducts({ supplierId: '09.317.318/0001-75', query: ' leite ', database });
  assert.deepEqual(calls[0].params, ['fortali', 300]);
  assert.deepEqual(calls[1].params, ['09317318000175', 'leite', 1000]);
  assert.match(calls[0].sql, /raw\.tb_505_compra/);
});
