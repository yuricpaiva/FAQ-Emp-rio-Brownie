const { Pool } = require('pg');

const DEFAULT_DATABASE = 'everest_impostos_db';
const DEFAULT_PORT = 5438;
const DEFAULT_SCHEMA = 'raw';
const DEFAULT_TABLE = 'tb_505_compra';

let pool;

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeCnpj(value) {
  return cleanText(value).replace(/\D/g, '');
}

function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : cleanText(value);
}

function moneyToCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function quantityText(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return amount.toFixed(4).replace(/\.?0+$/, '');
}

function getPurchaseDatabaseConfiguration() {
  return {
    host: process.env.PURCHASE_DB_HOST || process.env.DW_DB_HOST,
    port: Number(process.env.PURCHASE_DB_PORT || DEFAULT_PORT),
    database: process.env.PURCHASE_DB_NAME || DEFAULT_DATABASE,
    user: process.env.PURCHASE_DB_USER || process.env.DW_DB_USER,
    password: process.env.PURCHASE_DB_PASSWORD || process.env.DW_DB_PASSWORD,
    ssl: String(process.env.PURCHASE_DB_SSL || 'true').toLowerCase() !== 'false'
  };
}

function getPurchaseDatabase() {
  if (!pool) {
    const config = getPurchaseDatabaseConfiguration();
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
  }
  return pool;
}

function supplierPayload(row) {
  const cnpj = normalizeCnpj(row.cnpj);
  const legalName = cleanText(row.legal_name);
  return {
    id: cnpj,
    everestId: cnpj,
    source: 'EVEREST',
    name: legalName,
    legalName,
    cnpj: formatCnpj(cnpj)
  };
}

function unitPayload(row) {
  const productId = cleanText(row.product_id);
  const code = cleanText(row.unit_code);
  const label = cleanText(row.packaging) || code || 'Unidade';
  const id = [productId, code, label].join(':');
  return { id, everestId: id, code, label };
}

function productPayload(row) {
  const productId = cleanText(row.product_id);
  return {
    id: productId,
    everestId: productId,
    supplierId: normalizeCnpj(row.cnpj),
    productSource: 'EVEREST',
    code: productId,
    description: cleanText(row.description),
    supplierCode: cleanText(row.supplier_product_id),
    unit: unitPayload(row)
  };
}

function historyPayload(row) {
  return {
    orderId: cleanText(row.source_id),
    orderNumber: row.invoice_number ? `NF ${cleanText(row.invoice_number)}` : 'Nota fiscal',
    createdAt: row.purchase_date,
    quantity: quantityText(row.quantity),
    supplierUnit: unitPayload(row),
    unitPriceCents: moneyToCents(row.unit_price)
  };
}

async function searchSuppliers({ query = '', limit = 300, database = getPurchaseDatabase() } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 300));
  const term = cleanText(query);
  const result = await database.query(
    `
      SELECT cnpj, legal_name
      FROM (
        SELECT DISTINCT ON (REGEXP_REPLACE(cpf_cnpj_emitente, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(cpf_cnpj_emitente, '[^0-9]', '', 'g') AS cnpj,
          BTRIM("Razão Emitente") AS legal_name,
          "D. Emissão" AS purchase_date,
          id_espelho
        FROM ${DEFAULT_SCHEMA}.${DEFAULT_TABLE}
        WHERE at_situacao = 1
          AND "Origem" = 'ENTRADA'
          AND NULLIF(BTRIM(cpf_cnpj_emitente), '') IS NOT NULL
          AND NULLIF(BTRIM("Razão Emitente"), '') IS NOT NULL
        ORDER BY REGEXP_REPLACE(cpf_cnpj_emitente, '[^0-9]', '', 'g'), "D. Emissão" DESC NULLS LAST, id_espelho DESC
      ) latest
      WHERE $1 = ''
         OR legal_name ILIKE '%' || $1 || '%'
         OR (
           REGEXP_REPLACE($1, '[^0-9]', '', 'g') <> ''
           AND cnpj LIKE '%' || REGEXP_REPLACE($1, '[^0-9]', '', 'g') || '%'
         )
      ORDER BY legal_name
      LIMIT $2
    `,
    [term, safeLimit]
  );
  return result.rows.map(supplierPayload);
}

async function searchProducts({ supplierId = '', query = '', limit = 1000, database = getPurchaseDatabase() } = {}) {
  const cnpj = normalizeCnpj(supplierId);
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 1000));
  const term = cleanText(query);
  const result = await database.query(
    `
      SELECT cnpj, product_id, description, supplier_product_id, packaging, unit_code
      FROM (
        SELECT DISTINCT ON (BTRIM("Item"))
          REGEXP_REPLACE(cpf_cnpj_emitente, '[^0-9]', '', 'g') AS cnpj,
          BTRIM("Item") AS product_id,
          BTRIM("Descrição Item") AS description,
          BTRIM(COALESCE("Item Fornecedor", '')) AS supplier_product_id,
          BTRIM(COALESCE("Embalagem", '')) AS packaging,
          BTRIM(COALESCE("UM", '')) AS unit_code,
          "D. Emissão" AS purchase_date,
          id_espelho
        FROM ${DEFAULT_SCHEMA}.${DEFAULT_TABLE}
        WHERE at_situacao = 1
          AND "Origem" = 'ENTRADA'
          AND ($1 = '' OR REGEXP_REPLACE(cpf_cnpj_emitente, '[^0-9]', '', 'g') = $1)
          AND NULLIF(BTRIM("Item"), '') IS NOT NULL
          AND NULLIF(BTRIM("Descrição Item"), '') IS NOT NULL
        ORDER BY BTRIM("Item"), "D. Emissão" DESC NULLS LAST, id_espelho DESC
      ) latest
      WHERE $2 = ''
         OR product_id ILIKE '%' || $2 || '%'
         OR description ILIKE '%' || $2 || '%'
         OR supplier_product_id ILIKE '%' || $2 || '%'
      ORDER BY description, product_id
      LIMIT $3
    `,
    [cnpj, term, safeLimit]
  );
  return result.rows.map(productPayload);
}

async function getProductPurchaseHistory({ supplierId = '', productId = '', limit = 2, database = getPurchaseDatabase() } = {}) {
  const cnpj = normalizeCnpj(supplierId);
  const product = cleanText(productId);
  if (!cnpj || !product) return [];
  const safeLimit = Math.min(10, Math.max(1, Number(limit) || 2));
  const result = await database.query(
    `
      SELECT
        id_espelho AS source_id,
        "N. Nota" AS invoice_number,
        "D. Emissão" AS purchase_date,
        BTRIM("Item") AS product_id,
        BTRIM(COALESCE("Embalagem", '')) AS packaging,
        BTRIM(COALESCE("UM", '')) AS unit_code,
        "Q. Embalagens" AS quantity,
        "V. Embalagem" AS unit_price
      FROM ${DEFAULT_SCHEMA}.${DEFAULT_TABLE}
      WHERE at_situacao = 1
        AND "Origem" = 'ENTRADA'
        AND REGEXP_REPLACE(cpf_cnpj_emitente, '[^0-9]', '', 'g') = $1
        AND BTRIM("Item") = $2
        AND "Q. Embalagens" IS NOT NULL
        AND "V. Embalagem" IS NOT NULL
      ORDER BY "D. Emissão" DESC NULLS LAST, id_espelho DESC
      LIMIT $3
    `,
    [cnpj, product, safeLimit]
  );
  return result.rows.map(historyPayload);
}

async function resetPurchaseDatabasePool() {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}

module.exports = {
  getProductPurchaseHistory,
  getPurchaseDatabaseConfiguration,
  historyPayload,
  productPayload,
  resetPurchaseDatabasePool,
  searchProducts,
  searchSuppliers,
  supplierPayload
};
