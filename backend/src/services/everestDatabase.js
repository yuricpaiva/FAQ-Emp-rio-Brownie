const availableStatuses = new Set(['available', 'not_found']);
let mysql;
let pool;

function isEverestEnabled() {
  return String(process.env.EVEREST_DB_ENABLED || '').toLowerCase() === 'true';
}

function isEverestStockDebugEnabled() {
  return String(process.env.EVEREST_STOCK_DEBUG || '').toLowerCase() === 'true';
}

function debugEverestStock(message, details) {
  if (isEverestStockDebugEnabled()) {
    console.log(`[Everest estoque] ${message}`, details);
  }
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

  const statusCounts = Object.values(items).reduce((totals, storeItems) => {
    Object.values(storeItems).forEach((item) => {
      totals[item.status] = (totals[item.status] || 0) + 1;
    });
    return totals;
  }, {});
  debugEverestStock('Resultado processado', {
    stockDate,
    returnedRows: Array.isArray(rows) ? rows.length : 0,
    statusCounts,
    returnedStores: normalizeValues((rows || []).map((row) => row.fantasia)),
    returnedProductCodesSample: normalizeValues((rows || []).map((row) => row.cd_item)).slice(0, 20),
  });

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

async function getEverestStockSnapshot({ stores, productCodes, stockDate = getEverestStockDate(), database }) {
  const normalizedStores = normalizeValues(stores);
  const normalizedCodes = normalizeValues(productCodes);
  if (!normalizedStores.length || !normalizedCodes.length) {
    return { stockDate, status: 'available', warnings: [], items: {} };
  }

  if (!isEverestEnabled()) {
    debugEverestStock('Consulta desabilitada', { stockDate });
    return {
      stockDate,
      status: 'unavailable',
      warnings: ['A consulta de estoque do Everest esta desabilitada neste ambiente.'],
      items: buildEmptyItems(normalizedStores, normalizedCodes, 'unavailable', 'Consulta do Everest desabilitada.'),
    };
  }

  const requiredConfig = ['EVEREST_DB_HOST', 'EVEREST_DB_NAME', 'EVEREST_DB_USER', 'EVEREST_DB_PASSWORD'];
  const missingConfig = requiredConfig.filter((key) => !String(process.env[key] || '').trim());
  if (missingConfig.length) {
    debugEverestStock('Configuracao incompleta', { stockDate, missingConfig });
    return {
      stockDate,
      status: 'unavailable',
      warnings: ['A conexao de estoque do Everest nao esta completamente configurada.'],
      items: buildEmptyItems(normalizedStores, normalizedCodes, 'unavailable', 'Configuracao do Everest incompleta.'),
    };
  }

  const storePlaceholders = normalizedStores.map(() => '?').join(', ');
  const codePlaceholders = normalizedCodes.map(() => '?').join(', ');
  debugEverestStock('Iniciando consulta', {
    stockDate,
    host: process.env.EVEREST_DB_HOST,
    port: Number(process.env.EVEREST_DB_PORT || 3306),
    database: process.env.EVEREST_DB_NAME,
    stores: normalizedStores,
    productCodeCount: normalizedCodes.length,
    productCodesSample: normalizedCodes.slice(0, 20),
  });
  try {
    const connection = database || getEverestPool();
    const [rows] = await connection.execute(
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

    if (!rows.length) {
      const [dateCountRows] = await connection.execute(
        'SELECT COUNT(*) AS row_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY)',
        [stockDate, stockDate]
      );
      if (Number(dateCountRows[0]?.row_count || 0) === 0) {
        return {
          stockDate,
          status: 'date_unavailable',
          dateUnavailable: true,
          warnings: [`O Everest nao possui informacoes de estoque para a data ${stockDate}.`],
          items: buildEmptyItems(
            normalizedStores,
            normalizedCodes,
            'unavailable',
            'O Everest nao possui informacoes de estoque para esta data.'
          ),
        };
      }
    }

    return {
      ...buildStockSnapshotFromRows({
        rows,
        stockDate,
        stores: normalizedStores,
        productCodes: normalizedCodes,
      }),
      dateUnavailable: false,
    };
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

async function getEverestDiagnosticSnapshot(stockDate = getEverestStockDate()) {
  if (!isEverestEnabled()) {
    throw Object.assign(new Error('A consulta do Everest esta desabilitada.'), { code: 'EVEREST_DISABLED' });
  }

  const database = getEverestPool();
  const [serverRows] = await database.execute(
    'SELECT NOW() AS server_now, DATABASE() AS database_name, VERSION() AS server_version'
  );
  const [latestRows] = await database.execute(
    'SELECT DATE_FORMAT(dt_base, \'%Y-%m-%d\') AS stock_date FROM `525_saldo_estoque` WHERE dt_base IS NOT NULL ORDER BY dt_base DESC LIMIT 1'
  );
  const latestStockDate = latestRows[0]?.stock_date || null;
  const [requestedCountRows] = await database.execute(
    'SELECT COUNT(*) AS row_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY)',
    [stockDate, stockDate]
  );
  const requestedDateRowCount = Number(requestedCountRows[0]?.row_count || 0);
  const sampleDate = requestedDateRowCount > 0 ? stockDate : latestStockDate;

  if (!sampleDate) {
    return {
      server: serverRows[0] || {},
      stockDate,
      latestStockDate: null,
      sampleDate: null,
      requestedDateRowCount,
      summary: { rowCount: 0, storeCount: 0, productCount: 0 },
      stores: [],
      products: [],
      rows: [],
      duplicates: [],
      limits: { stores: 200, products: 5000, rows: 100, duplicates: 100 },
    };
  }

  const dateParams = [sampleDate, sampleDate];
  const [[summaryRows], [storeRows], [productRows], [sampleRows], [duplicateRows]] = await Promise.all([
    database.execute(
      'SELECT COUNT(*) AS row_count, COUNT(DISTINCT TRIM(fantasia)) AS store_count, COUNT(DISTINCT cd_item) AS product_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY)',
      dateParams
    ),
    database.execute(
      'SELECT TRIM(fantasia) AS fantasia, COUNT(*) AS row_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY TRIM(fantasia) ORDER BY row_count DESC, fantasia LIMIT 200',
      dateParams
    ),
    database.execute(
      'SELECT TRIM(CAST(cd_item AS CHAR)) AS cd_item, COUNT(*) AS row_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY cd_item ORDER BY cd_item LIMIT 5000',
      dateParams
    ),
    database.execute(
      'SELECT DATE_FORMAT(dt_base, \'%Y-%m-%d\') AS dt_base, TRIM(fantasia) AS fantasia, TRIM(CAST(cd_item AS CHAR)) AS cd_item, qt_saldo FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY fantasia, cd_item LIMIT 100',
      dateParams
    ),
    database.execute(
      'SELECT TRIM(fantasia) AS fantasia, TRIM(CAST(cd_item AS CHAR)) AS cd_item, COUNT(*) AS row_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY TRIM(fantasia), cd_item HAVING COUNT(*) > 1 ORDER BY row_count DESC LIMIT 100',
      dateParams
    ),
  ]);

  const summary = summaryRows[0] || {};
  return {
    server: serverRows[0] || {},
    stockDate,
    latestStockDate,
    sampleDate,
    requestedDateRowCount,
    summary: {
      rowCount: Number(summary.row_count || 0),
      storeCount: Number(summary.store_count || 0),
      productCount: Number(summary.product_count || 0),
    },
    stores: storeRows.map((row) => ({ fantasia: String(row.fantasia ?? ''), rowCount: Number(row.row_count || 0) })),
    products: productRows.map((row) => ({ cdItem: String(row.cd_item ?? ''), rowCount: Number(row.row_count || 0) })),
    rows: sampleRows.map((row) => ({
      dtBase: row.dt_base,
      fantasia: String(row.fantasia ?? ''),
      cdItem: String(row.cd_item ?? ''),
      stockQuantity: Number(row.qt_saldo),
    })),
    duplicates: duplicateRows.map((row) => ({
      fantasia: String(row.fantasia ?? ''),
      cdItem: String(row.cd_item ?? ''),
      rowCount: Number(row.row_count || 0),
    })),
    limits: { stores: 200, products: 5000, rows: 100, duplicates: 100 },
  };
}

function isStockAvailable(stockItem) {
  return availableStatuses.has(stockItem?.status);
}

async function resetEverestPool() {
  const currentPool = pool;
  pool = undefined;
  if (currentPool) await currentPool.end();
}

module.exports = {
  buildStockSnapshotFromRows,
  getEverestStockDate,
  getEverestDiagnosticSnapshot,
  getEverestStockSnapshot,
  isStockAvailable,
  resetEverestPool,
};
