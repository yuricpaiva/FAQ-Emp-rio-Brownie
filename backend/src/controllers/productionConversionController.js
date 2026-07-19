const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function toPositiveNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

function normalizeConversions(conversions) {
  const conversionsBySource = new Map();

  if (!Array.isArray(conversions)) {
    return [];
  }

  conversions.forEach((conversion) => {
    const sourceProductId = Number(conversion?.sourceProductId);
    const conversionCode = String(conversion?.conversionCode || '').trim();
    const conversionName = String(conversion?.conversionName || '').trim();
    const conversionFactor = toPositiveNumber(conversion?.conversionFactor);
    const roundedFactor = Math.round((conversionFactor + Number.EPSILON) * 10000) / 10000;

    if (!Number.isInteger(sourceProductId) || sourceProductId <= 0) return;
    if (!conversionCode || !conversionName) return;
    if (conversionFactor <= 0 || roundedFactor !== conversionFactor) return;

    conversionsBySource.set(sourceProductId, {
      sourceProductId,
      conversionCode,
      conversionName,
      conversionFactor: roundedFactor
    });
  });

  return Array.from(conversionsBySource.values());
}

function validateConversionConfiguration(conversions, sourceProducts) {
  const sourceCodeById = new Map(sourceProducts.map((product) => [product.id, product.code]));
  const sourceCodes = new Set(sourceProducts.map((product) => product.code));
  const targetNames = new Map();
  for (const conversion of conversions) {
    const sourceCode = sourceCodeById.get(conversion.sourceProductId);
    if (sourceCode === conversion.conversionCode) {
      return 'O produto de origem e o produto convertido devem ser diferentes.';
    }
    if (sourceCodes.has(conversion.conversionCode)) {
      return 'Conversoes encadeadas ou ciclicas nao sao permitidas.';
    }
    const normalizedName = conversion.conversionName.toLocaleLowerCase('pt-BR');
    const existingName = targetNames.get(conversion.conversionCode);
    if (existingName && existingName !== normalizedName) {
      return `Use o mesmo nome para o codigo convertido ${conversion.conversionCode}.`;
    }
    targetNames.set(conversion.conversionCode, normalizedName);
  }
  return '';
}

function mapProduct(product) {
  if (!product) return null;

  return {
    id: product.id,
    code: product.code,
    name: product.name,
    active: product.active
  };
}

function mapConversion(conversion) {
  return {
    id: conversion.id,
    sourceProductId: conversion.sourceProductId,
    conversionCode: conversion.conversionCode,
    conversionName: conversion.conversionName,
    conversionFactor: Number(conversion.conversionFactor),
    active: conversion.active,
    createdAt: conversion.createdAt,
    updatedAt: conversion.updatedAt,
    sourceProduct: mapProduct(conversion.sourceProduct)
  };
}

async function listProductionConversions(req, res) {
  const conversions = await prisma.productionConversion.findMany({
    where: { active: true },
    include: {
      sourceProduct: true
    },
    orderBy: [
      { sourceProduct: { code: 'asc' } },
      { id: 'asc' }
    ]
  });

  return res.json(conversions.map(mapConversion));
}

async function saveProductionConversions(req, res) {
  const rawConversions = Array.isArray(req.body?.conversions) ? req.body.conversions : [];
  const conversions = normalizeConversions(rawConversions);
  const activeSourceIds = conversions.map((conversion) => conversion.sourceProductId);
  const productIds = Array.from(new Set(conversions.map((conversion) => conversion.sourceProductId)));

  if (rawConversions.length !== conversions.length) {
    return res.status(400).json({ error: 'Informe produtos, codigos, nomes e fatores validos.' });
  }

  let sourceProducts = [];
  if (productIds.length) {
    sourceProducts = await prisma.productionProduct.findMany({
      where: {
        id: { in: productIds },
        active: true
      },
      select: { id: true, code: true, name: true }
    });
    const activeProductIds = new Set(sourceProducts.map((product) => product.id));
    const hasInvalidProduct = productIds.some((productId) => !activeProductIds.has(productId));

    if (hasInvalidProduct) {
      return res.status(400).json({ error: 'Selecione apenas produtos ativos.' });
    }
  }

  const validationError = validateConversionConfiguration(conversions, sourceProducts);
  if (validationError) return res.status(400).json({ error: validationError });

  const targetCodes = Array.from(new Set(conversions.map((conversion) => conversion.conversionCode)));
  const existingTargets = targetCodes.length
    ? await prisma.productionProduct.findMany({ where: { code: { in: targetCodes } } })
    : [];
  const existingTargetByCode = new Map(existingTargets.map((product) => [product.code, product]));
  const targetNameByCode = new Map(targetCodes.map((code) => [
    code,
    existingTargetByCode.get(code)?.name || conversions.find((conversion) => conversion.conversionCode === code).conversionName,
  ]));

  await prisma.$transaction(async (tx) => {
    await Promise.all(targetCodes.map((code) => tx.productionProduct.upsert({
      where: { code },
      update: { active: true },
      create: { code, name: targetNameByCode.get(code), active: true },
    })));

    await tx.productionConversion.updateMany({
      where: activeSourceIds.length ? { sourceProductId: { notIn: activeSourceIds } } : {},
      data: { active: false }
    });

    await Promise.all(conversions.map((conversion) =>
      tx.productionConversion.upsert({
        where: { sourceProductId: conversion.sourceProductId },
        update: {
          conversionCode: conversion.conversionCode,
          conversionName: targetNameByCode.get(conversion.conversionCode),
          conversionFactor: conversion.conversionFactor,
          active: true
        },
        create: {
          sourceProductId: conversion.sourceProductId,
          conversionCode: conversion.conversionCode,
          conversionName: targetNameByCode.get(conversion.conversionCode),
          conversionFactor: conversion.conversionFactor,
          active: true
        }
      })
    ));
  });

  const savedConversions = await prisma.productionConversion.findMany({
    where: { active: true },
    include: {
      sourceProduct: true
    },
    orderBy: [
      { sourceProduct: { code: 'asc' } },
      { id: 'asc' }
    ]
  });

  return res.json(savedConversions.map(mapConversion));
}

module.exports = {
  listProductionConversions,
  saveProductionConversions,
  validateConversionConfiguration,
};
