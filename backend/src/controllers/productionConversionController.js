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

    if (!Number.isInteger(sourceProductId) || sourceProductId <= 0) return;
    if (!conversionCode || !conversionName) return;
    if (conversionFactor <= 0) return;

    conversionsBySource.set(sourceProductId, {
      sourceProductId,
      conversionCode,
      conversionName,
      conversionFactor
    });
  });

  return Array.from(conversionsBySource.values());
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

  if (productIds.length) {
    const activeProducts = await prisma.productionProduct.findMany({
      where: {
        id: { in: productIds },
        active: true
      },
      select: { id: true }
    });
    const activeProductIds = new Set(activeProducts.map((product) => product.id));
    const hasInvalidProduct = productIds.some((productId) => !activeProductIds.has(productId));

    if (hasInvalidProduct) {
      return res.status(400).json({ error: 'Selecione apenas produtos ativos.' });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productionConversion.updateMany({
      where: activeSourceIds.length ? { sourceProductId: { notIn: activeSourceIds } } : {},
      data: { active: false }
    });

    await Promise.all(conversions.map((conversion) =>
      tx.productionConversion.upsert({
        where: { sourceProductId: conversion.sourceProductId },
        update: {
          conversionCode: conversion.conversionCode,
          conversionName: conversion.conversionName,
          conversionFactor: conversion.conversionFactor,
          active: true
        },
        create: {
          sourceProductId: conversion.sourceProductId,
          conversionCode: conversion.conversionCode,
          conversionName: conversion.conversionName,
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
  saveProductionConversions
};
