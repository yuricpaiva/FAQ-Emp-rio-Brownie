function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, '') : code;
}

function findMatches(value, candidates, normalizer) {
  const exact = candidates.filter((candidate) => candidate === String(value ?? '').trim());
  const normalizedValue = normalizer(value);
  const normalized = candidates.filter((candidate) => normalizer(candidate) === normalizedValue);
  return { exact, normalized };
}

function buildEverestDiagnosticReport({ snapshot, stores, products, configuration, generatedBy }) {
  const databaseStoreNames = snapshot.stores.map((store) => store.fantasia);
  const databaseProductCodes = snapshot.products.map((product) => product.cdItem);

  const storeMatching = stores.map((store) => {
    const displayMatches = findMatches(store.displayName, databaseStoreNames, normalizeText);
    const sourceMatches = findMatches(store.sourceName, databaseStoreNames, normalizeText);
    return {
      displayName: store.displayName,
      sourceName: store.sourceName,
      exactDisplayNameMatch: displayMatches.exact.length > 0,
      normalizedDisplayNameCandidates: displayMatches.normalized,
      exactSourceNameMatch: sourceMatches.exact.length > 0,
      normalizedSourceNameCandidates: sourceMatches.normalized,
    };
  });

  const productMatching = products.map((product) => {
    const matches = findMatches(product.code, databaseProductCodes, normalizeCode);
    return {
      code: product.code,
      name: product.name,
      exactMatch: matches.exact.length > 0,
      normalizedCandidates: matches.normalized,
    };
  });

  const warnings = [];
  if (!snapshot.requestedDateRowCount) warnings.push('Nao existem registros para a data atual; os exemplos usam a data mais recente encontrada.');
  if (!snapshot.latestStockDate) warnings.push('A tabela de estoque nao possui nenhuma data disponivel.');
  if (snapshot.summary.storeCount > snapshot.limits.stores) warnings.push('A lista de lojas do Everest foi limitada; algumas lojas podem nao aparecer na comparacao.');
  if (snapshot.summary.productCount > snapshot.limits.products) warnings.push('A lista de produtos do Everest foi limitada; alguns codigos podem nao aparecer na comparacao.');
  if (storeMatching.some((store) => !store.exactDisplayNameMatch)) warnings.push('Existem lojas sem correspondencia exata entre displayName e fantasia.');
  if (productMatching.some((product) => !product.exactMatch)) warnings.push('Existem produtos ativos sem correspondencia exata com cd_item.');
  if (snapshot.duplicates.length) warnings.push('Existem combinacoes de loja e produto duplicadas na data usada nos exemplos.');

  return {
    report: {
      type: 'everest-stock-diagnostic',
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy,
    },
    connection: {
      enabled: configuration.enabled,
      host: configuration.host,
      port: configuration.port,
      database: configuration.database,
      user: configuration.user,
      charset: configuration.charset,
      timezone: configuration.timezone,
      passwordConfigured: configuration.passwordConfigured,
      serverDatabase: snapshot.server.database_name || null,
      serverVersion: snapshot.server.server_version || null,
      serverNow: snapshot.server.server_now || null,
    },
    dates: {
      requestedStockDate: snapshot.stockDate,
      latestStockDate: snapshot.latestStockDate,
      examplesStockDate: snapshot.sampleDate,
      requestedDateRowCount: snapshot.requestedDateRowCount,
    },
    databaseSummary: snapshot.summary,
    matchingSummary: {
      applicationStoreCount: stores.length,
      exactStoreMatches: storeMatching.filter((store) => store.exactDisplayNameMatch).length,
      applicationProductCount: products.length,
      exactProductMatches: productMatching.filter((product) => product.exactMatch).length,
    },
    storeMatching,
    productMatching,
    databaseExamples: {
      stores: snapshot.stores,
      productCodes: snapshot.products,
      stockRows: snapshot.rows,
      duplicateKeys: snapshot.duplicates,
      limits: snapshot.limits,
    },
    warnings,
    security: {
      passwordIncluded: false,
      sqlIncluded: false,
      personalDataIncluded: false,
    },
  };
}

module.exports = {
  buildEverestDiagnosticReport,
  normalizeCode,
  normalizeText,
};
