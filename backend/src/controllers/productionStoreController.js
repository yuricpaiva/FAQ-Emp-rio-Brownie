const { PrismaClient } = require('@prisma/client');
const { queryDw } = require('../services/dwDatabase');

const prisma = new PrismaClient();

const unusedMockSourceStores = [
  'Emporio Brownie - Aldeota',
  'Emporio Brownie - Iguatemi',
  'Emporio Brownie - RioMar',
  'Emporio Brownie - Eusébio'
];

function slugifyStoreName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeWeekdays(weekdays) {
  if (!Array.isArray(weekdays)) return [];

  return Array.from(new Set(
    weekdays
      .map((weekday) => Number(weekday))
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
  )).sort((a, b) => a - b);
}

function mapStore(store) {
  return {
    id: store.id,
    sourceCode: store.sourceCode,
    sourceName: store.sourceName,
    displayName: store.displayName,
    active: store.active,
    routeWeekdays: (store.routes || [])
      .filter((route) => route.active)
      .map((route) => route.weekday)
      .sort((a, b) => a - b),
    createdAt: store.createdAt,
    updatedAt: store.updatedAt
  };
}

async function findActiveStores() {
  return prisma.productionStore.findMany({
    where: { active: true },
    include: {
      routes: {
        where: { active: true },
        orderBy: { weekday: 'asc' }
      }
    },
    orderBy: [
      { displayName: 'asc' },
      { id: 'asc' }
    ]
  });
}

async function findStoresForSettings() {
  return prisma.productionStore.findMany({
    include: {
      routes: {
        where: { active: true },
        orderBy: { weekday: 'asc' }
      }
    },
    orderBy: [
      { active: 'desc' },
      { displayName: 'asc' },
      { id: 'asc' }
    ]
  });
}

async function syncProductionStores(req, res) {
  try {
    const result = await queryDw(`
      SELECT DISTINCT TRIM(loja) AS loja
      FROM (
        SELECT loja
        FROM dw.vendas
        WHERE loja IS NOT NULL
          AND TRIM(loja) <> ''
        UNION
        SELECT loja
        FROM dw.produtos
        WHERE loja IS NOT NULL
          AND TRIM(loja) <> ''
      ) lojas
      ORDER BY TRIM(loja)
    `);
    const sourceStores = result.rows.map((row) => {
      const sourceName = String(row.loja || '').trim();
      return {
        sourceCode: slugifyStoreName(sourceName),
        sourceName
      };
    }).filter((store) => store.sourceCode && store.sourceName);
    const sourceCodes = sourceStores.map((store) => store.sourceCode);

    await prisma.$transaction(async (tx) => {
      await tx.productionStore.updateMany({
        where: sourceCodes.length ? { sourceCode: { notIn: sourceCodes } } : {},
        data: { active: false }
      });

      await Promise.all(sourceStores.map((store) =>
        tx.productionStore.upsert({
          where: { sourceCode: store.sourceCode },
          update: {
            sourceName: store.sourceName
          },
          create: {
            sourceCode: store.sourceCode,
            sourceName: store.sourceName,
            displayName: store.sourceName,
            active: false
          }
        })
      ));
    });

    const stores = await findStoresForSettings();
    return res.json({
      foundCount: sourceStores.length,
      stores: stores.map(mapStore)
    });
  } catch (error) {
    console.error('Falha ao sincronizar lojas de producao:', error);
    return res.status(500).json({ error: 'Nao foi possivel buscar as lojas no banco de vendas.' });
  }
}

async function listProductionStores(req, res) {
  const includeInactive = req.query?.includeInactive === 'true';
  const stores = includeInactive ? await findStoresForSettings() : await findActiveStores();
  return res.json(stores.map(mapStore));
}

async function saveProductionStores(req, res) {
  const stores = Array.isArray(req.body?.stores) ? req.body.stores : [];
  const normalizedStores = stores.map((store) => ({
    id: Number(store?.id),
    displayName: String(store?.displayName || '').trim(),
    active: Boolean(store?.active)
  })).filter((store) => Number.isInteger(store.id) && store.id > 0 && store.displayName);

  if (stores.length !== normalizedStores.length) {
    return res.status(400).json({ error: 'Informe nomes de exibicao validos.' });
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(normalizedStores.map((store) =>
      tx.productionStore.update({
        where: { id: store.id },
        data: {
          displayName: store.displayName,
          active: store.active
        }
      })
    ));
  });

  const savedStores = await findStoresForSettings();
  return res.json(savedStores.map(mapStore));
}

async function saveProductionStoreRoutes(req, res) {
  const routes = Array.isArray(req.body?.routes) ? req.body.routes : [];
  const normalizedRoutes = routes.map((route) => ({
    storeId: Number(route?.storeId),
    weekdays: normalizeWeekdays(route?.weekdays)
  })).filter((route) => Number.isInteger(route.storeId) && route.storeId > 0);

  if (routes.length !== normalizedRoutes.length) {
    return res.status(400).json({ error: 'Informe lojas validas.' });
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(normalizedRoutes.map(async (route) => {
      await tx.productionStoreRoute.updateMany({
        where: { storeId: route.storeId },
        data: { active: false }
      });

      await Promise.all(route.weekdays.map((weekday) =>
        tx.productionStoreRoute.upsert({
          where: {
            storeId_weekday: {
              storeId: route.storeId,
              weekday
            }
          },
          update: { active: true },
          create: {
            storeId: route.storeId,
            weekday,
            active: true
          }
        })
      ));
    }));
  });

  const savedStores = await findStoresForSettings();
  return res.json(savedStores.map(mapStore));
}

module.exports = {
  listProductionStores,
  saveProductionStoreRoutes,
  saveProductionStores,
  syncProductionStores
};
