const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeProducts(products) {
  const productsByCode = new Map();

  if (!Array.isArray(products)) {
    return [];
  }

  products.forEach((product) => {
    const code = String(product?.code || '').trim();
    const name = String(product?.name || '').trim();

    if (!code) return;

    productsByCode.set(code, { code, name });
  });

  return Array.from(productsByCode.values());
}

function mapProduct(product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    active: product.active,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

async function listProductionProducts(req, res) {
  const products = await prisma.productionProduct.findMany({
    where: { active: true },
    orderBy: { code: 'asc' }
  });

  return res.json(products.map(mapProduct));
}

async function saveProductionProducts(req, res) {
  const products = normalizeProducts(req.body?.products);
  const activeConversions = await prisma.productionConversion.findMany({
    where: { active: true },
    select: {
      conversionCode: true,
      sourceProduct: { select: { code: true } },
    },
  });
  const protectedCodes = activeConversions.flatMap((conversion) => [
    conversion.sourceProduct.code,
    conversion.conversionCode,
  ]);
  const activeCodes = Array.from(new Set([...products.map((product) => product.code), ...protectedCodes]));

  if (!products.length) {
    return res.status(400).json({ error: 'Informe pelo menos um produto com codigo.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.productionProduct.updateMany({
      where: activeCodes.length ? { code: { notIn: activeCodes } } : {},
      data: { active: false }
    });

    await Promise.all(products.map((product) =>
      tx.productionProduct.upsert({
        where: { code: product.code },
        update: {
          name: product.name,
          active: true
        },
        create: {
          code: product.code,
          name: product.name,
          active: true
        }
      })
    ));
    if (protectedCodes.length) {
      await tx.productionProduct.updateMany({
        where: { code: { in: protectedCodes } },
        data: { active: true },
      });
    }
  });

  const savedProducts = await prisma.productionProduct.findMany({
    where: { active: true },
    orderBy: { code: 'asc' }
  });

  return res.json(savedProducts.map(mapProduct));
}

async function upsertProductionProduct(req, res) {
  const code = String(req.body?.code || '').trim();
  const name = String(req.body?.name || '').trim();

  if (!code || !name) {
    return res.status(400).json({ error: 'Informe o codigo e o nome do produto.' });
  }

  const product = await prisma.productionProduct.upsert({
    where: { code },
    update: { name, active: true },
    create: { code, name, active: true }
  });

  return res.status(201).json(mapProduct(product));
}

module.exports = {
  listProductionProducts,
  saveProductionProducts,
  upsertProductionProduct
};
