const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../app');
const { getStockDate, parseQuantity } = require('../controllers/stockCountController');
const { validateCreateUserInput } = require('../utils/validation');
const prisma = new PrismaClient();

async function login(base, email, password) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie')?.split(';')[0];
}

test('stock count date uses America/Fortaleza and quantity accepts four decimals', () => {
  assert.equal(getStockDate(new Date('2026-07-21T01:30:00.000Z')), '2026-07-20');
  assert.equal(parseQuantity('1,2345'), 1.2345);
  assert.equal(parseQuantity(''), null);
  assert.throws(() => parseQuantity('-1'), /zero ou positiva/);
  assert.throws(() => parseQuantity('1.23456'), /quatro casas/);
  assert.throws(() => parseQuantity('1,23000'), /quatro casas/);
});

test('store users require exactly one production store assignment', () => {
  const base = { name: 'Loja', email: 'loja@test.local', password: '123456', role: 'store' };
  assert.match(validateCreateUserInput(base).error, /loja/i);
  assert.equal(validateCreateUserInput({ ...base, productionStoreId: 12 }).value.productionStoreId, 12);
  assert.equal(validateCreateUserInput({ ...base, role: 'reader', productionStoreId: 12 }).value.productionStoreId, null);
});

test('stock counts are scoped by store, resumable and immutable after finalization', async (t) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const password = 'count123';
  const passwordHash = await bcrypt.hash(password, 4);
  const createdCountIds = [];

  const storeA = await prisma.productionStore.create({
    data: { sourceCode: `COUNT-A-${suffix}`, sourceName: `Count A ${suffix}`, displayName: `Loja Count A ${suffix}`, active: true },
  });
  const storeB = await prisma.productionStore.create({
    data: { sourceCode: `COUNT-B-${suffix}`, sourceName: `Count B ${suffix}`, displayName: `Loja Count B ${suffix}`, active: true },
  });
  const product = await prisma.productionProduct.create({
    data: { code: `COUNT-${suffix}`, name: `Produto Count ${suffix}`, active: true },
  });
  const userA = await prisma.user.create({
    data: { name: 'Contador A', email: `count-a-${suffix}@test.local`, passwordHash, role: 'store', productionStoreId: storeA.id, active: true },
  });
  const userB = await prisma.user.create({
    data: { name: 'Contador B', email: `count-b-${suffix}@test.local`, passwordHash, role: 'store', productionStoreId: storeB.id, active: true },
  });

  const server = app.listen(0);
  t.after(async () => {
    server.close();
    await prisma.stockCount.deleteMany({ where: { id: { in: createdCountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.productionProduct.delete({ where: { id: product.id } });
    await prisma.productionStore.deleteMany({ where: { id: { in: [storeA.id, storeB.id] } } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookieA = await login(base, userA.email, password);
  const cookieB = await login(base, userB.email, password);

  const create = await fetch(`${base}/stock-counts`, {
    method: 'POST',
    headers: { cookie: cookieA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productionStoreId: storeB.id }),
  });
  assert.equal(create.status, 201, await create.clone().text());
  const count = await create.json();
  createdCountIds.push(count.id);
  assert.equal(count.productionStoreId, storeA.id);
  const testItem = count.items.find((item) => item.productionProductId === product.id);
  assert.ok(testItem);

  const resumed = await fetch(`${base}/stock-counts`, {
    method: 'POST', headers: { cookie: cookieA, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).id, count.id);

  const forbidden = await fetch(`${base}/stock-counts/${count.id}`, { headers: { cookie: cookieB } });
  assert.equal(forbidden.status, 403);

  const saved = await fetch(`${base}/stock-counts/${count.id}/items/${testItem.id}`, {
    method: 'PATCH',
    headers: { cookie: cookieA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: '2,125' }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).quantity, 2.125);

  const negative = await fetch(`${base}/stock-counts/${count.id}/items/${testItem.id}`, {
    method: 'PATCH',
    headers: { cookie: cookieA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: -1 }),
  });
  assert.equal(negative.status, 400);

  const finalized = await fetch(`${base}/stock-counts/${count.id}/finalize`, { method: 'POST', headers: { cookie: cookieA } });
  assert.equal(finalized.status, 200, await finalized.clone().text());
  const finalizedCount = await finalized.json();
  assert.equal(finalizedCount.status, 'finalized');
  assert.equal(finalizedCount.items.every((item) => item.quantity !== null), true);

  const immutable = await fetch(`${base}/stock-counts/${count.id}/items/${testItem.id}`, {
    method: 'PATCH',
    headers: { cookie: cookieA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: 3 }),
  });
  assert.equal(immutable.status, 409);

  const duplicate = await fetch(`${base}/stock-counts`, {
    method: 'POST', headers: { cookie: cookieA, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(duplicate.status, 409);
});
