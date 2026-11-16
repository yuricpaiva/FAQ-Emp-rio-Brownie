const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const app = require('../app');

const prisma = new PrismaClient();

async function request(base, path, { method = 'GET', cookie, body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function login(base, email, password) {
  const response = await request(base, '/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

async function json(response, status = 200) {
  if (response.status !== status) assert.fail(`Esperado ${status}, recebido ${response.status}: ${await response.text()}`);
  return response.json();
}

test('pedidos são compartilhados e edição/cancelamento são exclusivos de administradores', async (t) => {
  process.env.JWT_SECRET ||= 'purchase-tests-secret';
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'purchase-test-123';
  const passwordHash = await bcrypt.hash(password, 4);
  const users = await Promise.all([
    prisma.user.create({ data: { name: 'Admin Compras', email: `admin-purchases-${suffix}@test.local`, passwordHash, role: 'admin' } }),
    prisma.user.create({ data: { name: 'Comprador Autorizado', email: `buyer-purchases-${suffix}@test.local`, passwordHash, role: 'creator' } }),
    prisma.user.create({ data: { name: 'Criador sem Acesso', email: `outsider-purchases-${suffix}@test.local`, passwordHash, role: 'creator' } }),
    prisma.user.create({ data: { name: 'Leitor Compras', email: `reader-purchases-${suffix}@test.local`, passwordHash, role: 'reader' } })
  ]);
  const [admin, buyer, outsider, reader] = users;
  const originalSettings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const originalAccess = await prisma.purchaseAccess.findMany({ select: { userId: true } });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    server.close();
    await prisma.purchaseOrder.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.purchaseAccess.deleteMany();
    if (originalAccess.length) await prisma.purchaseAccess.createMany({ data: originalAccess });
    if (originalSettings) {
      await prisma.appSettings.update({
        where: { id: 1 },
        data: {
          purchaseSignatureThresholdCents: originalSettings.purchaseSignatureThresholdCents,
          purchaseSignatureLabel: originalSettings.purchaseSignatureLabel
        }
      });
    }
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  });

  const adminCookie = await login(base, admin.email, password);
  const buyerCookie = await login(base, buyer.email, password);
  const outsiderCookie = await login(base, outsider.email, password);
  const readerCookie = await login(base, reader.email, password);

  const settings = await json(await request(base, '/api/admin/purchase-settings', {
    method: 'PUT',
    cookie: adminCookie,
    body: { signatureThresholdCents: 5000, signatureLabel: 'Gerente Financeiro', userIds: [buyer.id] }
  }));
  assert.deepEqual(settings.userIds, [buyer.id]);
  assert.deepEqual(await json(await request(base, '/api/purchases/access', { cookie: buyerCookie })), { hasAccess: true, canManage: false });
  assert.deepEqual(await json(await request(base, '/api/purchases/access', { cookie: adminCookie })), { hasAccess: true, canManage: true });
  assert.deepEqual(await json(await request(base, '/api/purchases/access', { cookie: outsiderCookie })), { hasAccess: false, canManage: false });
  assert.equal((await request(base, '/api/purchases/orders', { cookie: outsiderCookie })).status, 403);
  assert.equal((await request(base, '/api/purchases/orders', { cookie: readerCookie })).status, 403);

  const draft = {
    supplier: { id: 'sup-cacau', everestId: 'EV-FOR-1042', name: 'Cacau Nobre', legalName: 'Cacau Nobre Ltda.', cnpj: '12.345.678/0001-90' },
    items: [{ productId: 'prd-cacau-po', everestProductId: 'EV-PRD-503', code: 'CACAU-100', description: 'Cacau em pó 100%', quantity: '2', supplierUnit: { id: 'un-sc-5kg', code: 'SC', label: 'Saco 5 kg' }, unitPriceCents: 2500 }],
    additions: []
  };
  const created = await json(await request(base, '/api/purchases/orders', { method: 'POST', cookie: buyerCookie, body: draft }), 201);
  assert.equal(created.buyer.id, buyer.id);
  assert.equal(created.supplier.source, 'EVEREST');
  assert.equal(created.items[0].productSource, 'EVEREST');
  assert.equal(created.totalCents, 5000);
  assert.deepEqual(created.signatureRequirement, { label: 'Gerente Financeiro', thresholdCents: 5000 });
  assert.match(created.number, /^PC-\d{6}-\d{4}$/);

  const manualDraft = {
    supplier: { source: 'MANUAL_CNPJ', id: 'ignored-by-server', cnpj: '11.222.333/0001-81' },
    items: [{
      productId: `manual:${suffix}`,
      productSource: 'MANUAL',
      code: '',
      description: 'Embalagem avulsa especial',
      quantity: '4',
      supplierUnit: { id: `manual-unit:${suffix}`, everestId: '', code: '', label: 'Pacote com 20 unidades' },
      unitPriceCents: 1250
    }],
    additions: []
  };
  const manualOrder = await json(await request(base, '/api/purchases/orders', { method: 'POST', cookie: buyerCookie, body: manualDraft }), 201);
  assert.equal(manualOrder.supplier.id, 'cnpj:11222333000181');
  assert.equal(manualOrder.supplier.source, 'MANUAL_CNPJ');
  assert.equal(manualOrder.supplier.name, 'Fornecedor não cadastrado no Everest');
  assert.equal(manualOrder.supplier.cnpj, '11.222.333/0001-81');
  assert.equal(manualOrder.items[0].productSource, 'MANUAL');
  assert.equal(manualOrder.items[0].code, '');
  assert.equal(manualOrder.items[0].everestProductId, '');
  assert.equal(manualOrder.items[0].supplierUnit.everestId, '');

  const invalidCnpjResponse = await request(base, '/api/purchases/orders', {
    method: 'POST', cookie: buyerCookie, body: { ...manualDraft, supplier: { ...manualDraft.supplier, cnpj: '11.111.111/1111-11' } }
  });
  assert.equal(invalidCnpjResponse.status, 400);

  const duplicateManualResponse = await request(base, '/api/purchases/orders', {
    method: 'POST', cookie: buyerCookie, body: {
      ...manualDraft,
      items: [manualDraft.items[0], { ...manualDraft.items[0], productId: `manual:${suffix}:duplicate`, description: ' embalagem  AVULSA especial ', supplierUnit: { ...manualDraft.items[0].supplierUnit, id: `manual-unit:${suffix}:duplicate`, label: 'PACOTE COM 20 UNIDADES' } }]
    }
  });
  assert.equal(duplicateManualResponse.status, 400);

  assert.equal((await request(base, `/api/purchases/orders/${created.id}`, { method: 'PUT', cookie: buyerCookie, body: draft })).status, 403);
  assert.equal((await request(base, `/api/purchases/orders/${created.id}/cancel`, { method: 'PATCH', cookie: buyerCookie })).status, 403);

  const updated = await json(await request(base, `/api/purchases/orders/${created.id}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { ...draft, items: [{ ...draft.items[0], quantity: '3' }] }
  }));
  assert.equal(updated.number, created.number);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.buyer.id, buyer.id);
  assert.equal(updated.totalCents, 7500);

  const filtered = await json(await request(base, '/api/purchases/orders?productId=prd-cacau-po', { cookie: buyerCookie }));
  assert.equal(filtered.orders.some((order) => order.id === created.id), true);
  assert.equal(filtered.buyers.some((item) => item.id === buyer.id), true);

  const cancelled = await json(await request(base, `/api/purchases/orders/${created.id}/cancel`, { method: 'PATCH', cookie: adminCookie }));
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.cancelledBy.id, admin.id);
  assert.ok(cancelled.cancelledAt);
  assert.equal((await request(base, `/api/purchases/orders/${created.id}`, { method: 'PUT', cookie: adminCookie, body: draft })).status, 409);
});
