const availableStatuses = new Set(['available', 'not_found']);
let mysql;
let pool;

function isEverestEnabled() {
  return String(process.env.EVEREST_DB_ENABLED || '').toLowerCase() === 'true';
}

function getEverestStockDate(now = new Date()) {
  const timeZone = process.env.EVEREST_STOCK_TIMEZONE || 'America/Fortaleza';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeValues(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  ));
}

function buildEmptyItems(stores, productCodes, status, reason) {
  return Object.fromEntries(stores.map((storeName) => [
    storeName,
    Object.fromEntries(productCodes.map((code) => [code, { quantity: null, status, reason }])),
  ]));
}

function buildStockSnapshotFromRows({ rows, stockDate, stores, productCodes }) {
  const normalizedStores = normalizeValues(stores);
  const normalizedCodes = normalizeValues(productCodes);
  const rowsByKey = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const storeName = String(row.fantasia ?? '').trim();
    const productCode = String(row.cd_item ?? '').trim();
    const key = `${storeName}::${productCode}`;
    const currentRows = rowsByKey.get(key) || [];
    currentRows.push(row);
    rowsByKey.set(key, currentRows);
  });

  const duplicateKeys = [];
  const invalidKeys = [];
  const items = Object.fromEntries(normalizedStores.map((storeName) => [
    storeName,
    Object.fromEntries(normalizedCodes.map((productCode) => {
      const key = `${storeName}::${productCode}`;
      const matchingRows = rowsByKey.get(key) || [];

      if (!matchingRows.length) {
        return [productCode, { quantity: 0, status: 'not_found', reason: '' }];
      }
      if (matchingRows.length > 1) {
        duplicateKeys.push({ storeName, productCode, count: matchingRows.length });
        return [productCode, {
          quantity: null,
          status: 'duplicate',
          reason: 'Mais de um saldo encontrado para a mesma loja, data e produto.',
        }];
      }

      const quantity = Number(String(matchingRows[0].qt_saldo ?? '').replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity < 0) {
        invalidKeys.push({ storeName, productCode, value: matchingRows[0].qt_saldo });
        return [productCode, {
          quantity: null,
          status: 'unavailable',
          reason: quantity < 0 ? 'O saldo retornado pelo Everest e negativo.' : 'O saldo retornado pelo Everest e invalido.',
        }];
      }

      return [productCode, { quantity, status: 'available', reason: '' }];
    })),
  ]));

  if (duplicateKeys.length) console.warn('Saldos duplicados encontrados no Everest:', { stockDate, items: duplicateKeys });
  if (invalidKeys.length) console.warn('Saldos negativos ou invalidos encontrados no Everest:', { stockDate, items: invalidKeys });

  const warnings = [];
  if (duplicateKeys.length) warnings.push(`${duplicateKeys.length} saldo(s) duplicado(s) precisam ser conferidos no Everest.`);
  if (invalidKeys.length) warnings.push(`${invalidKeys.length} saldo(s) negativo(s) ou invalido(s) nao foram descontados.`);

  return {
    stockDate,
    status: warnings.length ? 'partial' : 'available',
    warnings,
    items,
  };
}

function getEverestPool() {
  if (!mysql) mysql = require('mysql2/promise');
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.EVEREST_DB_HOST,
      port: Number(process.env.EVEREST_DB_PORT || 3306),
      database: process.env.EVEREST_DB_NAME,
      user: process.env.EVEREST_DB_USER,
      password: process.env.EVEREST_DB_PASSWORD,
      charset: process.env.EVEREST_DB_CHARSET || 'LATIN1_GENERAL_CI',
      waitForConnections: true,
      connectionLimit: 5,
      maxIdle: 5,
      idleTimeout: 30000,
      connectTimeout: 10000,
      multipleStatements: false,
      decimalNumbers: true,
    });
  }

  return pool;
}

async function getEverestStockSnapshot({ stores, productCodes, stockDate = getEverestStockDate() }) {
  const normalizedStores = normalizeValues(stores);
  const normalizedCodes = normalizeValues(productCodes);
  if (!normalizedStores.length || !normalizedCodes.length) {
    return { stockDate, status: 'available', warnings: [], items: {} };
  }

  if (!isEverestEnabled()) {
    return {
      stockDate,
      status: 'unavailable',
      warnings: ['A consulta de estoque do Everest esta desabilitada neste ambiente.'],
      items: buildEmptyItems(normalizedStores, normalizedCodes, 'unavailable', 'Consulta do Everest desabilitada.'),
    };
  }

  const requiredConfig = ['EVEREST_DB_HOST', 'EVEREST_DB_NAME', 'EVEREST_DB_USER', 'EVEREST_DB_PASSWORD'];
  if (requiredConfig.some((key) => !String(process.env[key] || '').trim())) {
    return {
      stockDate,
      status: 'unavailable',
      warnings: ['A conexao de estoque do Everest nao esta completamente configurada.'],
      items: buildEmptyItems(normalizedStores, normalizedCodes, 'unavailable', 'Configuracao do Everest incompleta.'),
    };
  }

  const storePlaceholders = normalizedStores.map(() => '?').join(', ');
  const codePlaceholders = normalizedCodes.map(() => '?').join(', ');
  try {
    const [rows] = await getEverestPool().execute(
      `
        SELECT dt_base, fantasia, cd_item, qt_saldo
        FROM \`525_saldo_estoque\`
        WHERE dt_base >= ?
          AND dt_base < DATE_ADD(?, INTERVAL 1 DAY)
          AND BINARY TRIM(fantasia) IN (${storePlaceholders})
          AND cd_item IN (${codePlaceholders})
      `,
      [stockDate, stockDate, ...normalizedStores, ...normalizedCodes]
    );

    return buildStockSnapshotFromRows({
      rows,
      stockDate,
      stores: normalizedStores,
      productCodes: normalizedCodes,
    });
  } catch (error) {
    console.error('Falha ao consultar estoque no Everest:', error);
    return {
      stockDate,
      status: 'unavailable',
      warnings: ['Nao foi possivel consultar o estoque do Everest. A sugestao foi calculada sem descontar estoque.'],
      items: buildEmptyItems(normalizedStores, normalizedCodes, 'unavailable', 'Falha de conexao com o Everest.'),
    };
  }
}

function isStockAvailable(stockItem) {
  return availableStatuses.has(stockItem?.status);
}

module.exports = {
  buildStockSnapshotFromRows,
  getEverestStockDate,
  getEverestStockSnapshot,
  isStockAvailable,
};
