function toNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function roundQuantity(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
}

function buildConversionContext(products, conversions) {
  const productByCode = new Map((products || []).map((product) => [String(product.code), product]));
  const ruleBySource = new Map();
  const rulesByTarget = new Map();

  (conversions || []).forEach((conversion) => {
    const sourceCode = String(conversion.sourceProduct?.code || conversion.sourceCode || '').trim();
    const targetCode = String(conversion.conversionCode || conversion.targetCode || '').trim();
    const factor = roundQuantity(conversion.conversionFactor ?? conversion.factor);
    if (!sourceCode || !targetCode || factor <= 0) return;
    const targetProduct = productByCode.get(targetCode);
    const rule = {
      sourceCode,
      sourceName: conversion.sourceProduct?.name || conversion.sourceName || sourceCode,
      targetCode,
      targetName: targetProduct?.name || conversion.conversionName || conversion.targetName || targetCode,
      factor,
    };
    ruleBySource.set(sourceCode, rule);
    const targetRules = rulesByTarget.get(targetCode) || [];
    targetRules.push(rule);
    rulesByTarget.set(targetCode, targetRules);
  });

  return {
    productByCode,
    ruleBySource,
    rulesByTarget,
    sourceCodes: new Set(ruleBySource.keys()),
  };
}

function getOutputIdentity(code, name, context) {
  const normalizedCode = String(code || '').trim();
  const rule = context.ruleBySource.get(normalizedCode);
  const outputCode = rule?.targetCode || normalizedCode;
  return {
    code: outputCode,
    name: context.productByCode.get(outputCode)?.name || rule?.targetName || String(name || outputCode).trim(),
    factor: rule?.factor || 1,
  };
}

function convertSalesRows(rows, context) {
  const convertedByKey = new Map();
  (rows || []).forEach((row) => {
    const sourceCode = String(row.codigo_produto || '').trim();
    const output = getOutputIdentity(sourceCode, row.descricao_produto, context);
    if (!output.code) return;
    const storeName = String(row.store_name || '').trim();
    const saleDate = row.sale_date instanceof Date
      ? row.sale_date.toISOString().slice(0, 10)
      : String(row.sale_date || '').slice(0, 10);
    const key = `${storeName}::${saleDate}::${output.code}`;
    const current = convertedByKey.get(key) || {
      store_name: storeName,
      sale_date: saleDate,
      codigo_produto: output.code,
      descricao_produto: output.name,
      familia_item: '',
      quantidade_total: 0,
    };
    current.quantidade_total = roundQuantity(
      current.quantidade_total + Math.max(0, toNumber(row.quantidade_total)) * output.factor
    );
    if (sourceCode === output.code && row.familia_item) current.familia_item = row.familia_item;
    convertedByKey.set(key, current);
  });
  return Array.from(convertedByKey.values());
}

function convertOrderItems(items, context) {
  const convertedByCode = new Map();
  (items || []).forEach((item) => {
    const sourceCode = String(item.code || '').trim();
    if (!sourceCode) return;
    const output = getOutputIdentity(sourceCode, item.name, context);
    const fixedQuantity = roundQuantity(Math.max(0, toNumber(item.fixedQuantity)) * output.factor);
    const orderQuantity = roundQuantity(Math.max(0, toNumber(item.orderQuantity)) * output.factor);
    const current = convertedByCode.get(output.code) || {
      code: output.code,
      name: output.name,
      fixedQuantity: 0,
      orderQuantity: 0,
      sources: [],
    };
    current.fixedQuantity = roundQuantity(current.fixedQuantity + fixedQuantity);
    current.orderQuantity = roundQuantity(current.orderQuantity + orderQuantity);
    current.sources.push({
      code: sourceCode,
      name: String(item.name || sourceCode).trim(),
      fixedQuantity: roundQuantity(Math.max(0, toNumber(item.fixedQuantity))),
      orderQuantity: roundQuantity(Math.max(0, toNumber(item.orderQuantity))),
      factor: output.factor,
      convertedCode: output.code,
      convertedName: output.name,
    });
    convertedByCode.set(output.code, current);
  });
  return Array.from(convertedByCode.values()).sort((left, right) =>
    left.code.localeCompare(right.code, 'pt-BR', { numeric: true })
  );
}

function getStockContributorCodes(outputCode, context) {
  return [
    { code: outputCode, name: context.productByCode.get(outputCode)?.name || outputCode, factor: 1 },
    ...(context.rulesByTarget.get(outputCode) || []).map((rule) => ({
      code: rule.sourceCode,
      name: rule.sourceName,
      factor: rule.factor,
    })),
  ];
}

function getRequiredStockCodes(outputCodes, context) {
  return Array.from(new Set((outputCodes || []).flatMap((code) =>
    getStockContributorCodes(String(code), context).map((contributor) => contributor.code)
  )));
}

function convertStockItems(items, outputCodes, context) {
  const itemByCode = new Map((items || []).map((item) => [String(item.code || '').trim(), item]));
  return (outputCodes || []).map(String).map((outputCode) => {
    const contributors = getStockContributorCodes(outputCode, context).map((contributor) => {
      const item = itemByCode.get(contributor.code) || {
        quantity: 0,
        status: 'not_found',
        reason: '',
      };
      const quantity = item.quantity === null || item.quantity === undefined
        ? null
        : roundQuantity(Math.max(0, toNumber(item.quantity)));
      return {
        ...contributor,
        quantity,
        status: String(item.status || 'unavailable'),
        reason: String(item.reason || ''),
        convertedQuantity: quantity === null ? null : roundQuantity(quantity * contributor.factor),
      };
    });
    const invalidContributors = contributors.filter((item) => !['available', 'not_found'].includes(item.status));
    const anyAvailable = contributors.some((item) => item.status === 'available');
    const quantity = invalidContributors.length
      ? null
      : roundQuantity(contributors.reduce((sum, item) => sum + (item.convertedQuantity || 0), 0));
    return {
      code: outputCode,
      name: context.productByCode.get(outputCode)?.name || outputCode,
      quantity,
      status: invalidContributors.length ? 'unavailable' : anyAvailable ? 'available' : 'not_found',
      reason: invalidContributors.length
        ? `Estoque indisponivel na composicao: ${invalidContributors.map((item) => `${item.code}${item.reason ? ` (${item.reason})` : ''}`).join(', ')}.`
        : '',
      sources: contributors,
    };
  });
}

module.exports = {
  buildConversionContext,
  convertOrderItems,
  convertSalesRows,
  convertStockItems,
  getOutputIdentity,
  getRequiredStockCodes,
  roundQuantity,
};
