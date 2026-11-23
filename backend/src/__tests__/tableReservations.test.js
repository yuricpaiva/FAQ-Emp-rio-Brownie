const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'table-reservation-test-secret';

const app = require('../app');
const prisma = new PrismaClient();

async function request(base, path, { method = 'GET', cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function login(base, email, password) {
  const response = await request(base, '/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function expectJson(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

test('table reservation flow enforces access, unit scope and atomic check-in', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'reserva-mesa-123';
  const passwordHash = await bcrypt.hash(password, 4);
  const [storeA, storeB] = await Promise.all([
    prisma.productionStore.create({ data: { sourceCode: `TRA-${suffix}`, sourceName: `Loja A ${suffix}`, displayName: `Loja A ${suffix}`, tableReservationsEnabled: true } }),
    prisma.productionStore.create({ data: { sourceCode: `TRB-${suffix}`, sourceName: `Loja B ${suffix}`, displayName: `Loja B ${suffix}` } }),
  ]);
  const users = await Promise.all([
    prisma.user.create({ data: { name: 'Admin Mesas', email: `table-admin-${suffix}@test.local`, passwordHash, role: 'admin' } }),
    prisma.user.create({ data: { name: 'SAC Cadastro', email: `table-creator-${suffix}@test.local`, passwordHash, role: 'reader' } }),
    prisma.user.create({ data: { name: 'SAC Consulta', email: `table-viewer-${suffix}@test.local`, passwordHash, role: 'reader' } }),
    prisma.user.create({ data: { name: 'Loja A', email: `table-store-a-${suffix}@test.local`, passwordHash, role: 'store', productionStoreId: storeA.id } }),
    prisma.user.create({ data: { name: 'Loja B', email: `table-store-b-${suffix}@test.local`, passwordHash, role: 'store', productionStoreId: storeB.id } }),
    prisma.user.create({ data: { name: 'Admin sem acesso', email: `table-admin-no-access-${suffix}@test.local`, passwordHash, role: 'admin' } }),
  ]);
  const [admin, creator, viewer, storeUserA, storeUserB, unassignedAdmin] = users;
  await prisma.tableReservationAccess.createMany({
    data: [
      { userId: admin.id, canCreate: true, canView: true },
      { userId: creator.id, canCreate: true, canView: true },
      { userId: viewer.id, canCreate: false, canView: true },
      { userId: storeUserA.id, canCreate: true, canView: true },
    ],
  });
  const [tableA1, tableA2, tableB1] = await Promise.all([
    prisma.restaurantTable.create({ data: { productionStoreId: storeA.id, name: `Mesa 01 ${suffix}`, capacity: 4 } }),
    prisma.restaurantTable.create({ data: { productionStoreId: storeA.id, name: `Mesa 02 ${suffix}`, capacity: 6 } }),
    prisma.restaurantTable.create({ data: { productionStoreId: storeB.id, name: `Mesa B ${suffix}`, capacity: 4 } }),
  ]);
  const server = app.listen(0);

  t.after(async () => {
    server.close();
    await prisma.tableReservation.deleteMany({ where: { productionStoreId: { in: [storeA.id, storeB.id] } } });
    await prisma.restaurantTable.deleteMany({ where: { productionStoreId: { in: [storeA.id, storeB.id] } } });
    await prisma.tableReservationAccess.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.productionStore.deleteMany({ where: { id: { in: [storeA.id, storeB.id] } } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await request(base, '/table-reservations/access')).status, 401);
  const [adminCookie, creatorCookie, viewerCookie, storeACookie, storeBCookie, unassignedAdminCookie] = await Promise.all([
    login(base, admin.email, password), login(base, creator.email, password), login(base, viewer.email, password),
    login(base, storeUserA.email, password), login(base, storeUserB.email, password), login(base, unassignedAdmin.email, password),
  ]);

  const creatorCapabilities = await expectJson(await request(base, '/table-reservations/capabilities', { cookie: creatorCookie }), 200);
  assert.equal(creatorCapabilities.canCreate, true);
  assert.equal(creatorCapabilities.canCheckIn, true);
  const unassignedAdminCapabilities = await expectJson(await request(base, '/table-reservations/access', { cookie: unassignedAdminCookie }), 200);
  assert.equal(unassignedAdminCapabilities.hasAccess, false);
  assert.equal(unassignedAdminCapabilities.canManageTables, true);
  assert.equal((await request(base, '/admin/table-reservation-settings', { cookie: unassignedAdminCookie })).status, 200);
  const storeUnits = await expectJson(await request(base, '/table-reservations/units', { cookie: storeACookie }), 200);
  assert.deepEqual(storeUnits.map((unit) => unit.id), [storeA.id]);
  assert.equal((await request(base, '/table-reservations/units', { cookie: storeBCookie })).status, 403);
  const creatorUnits = await expectJson(await request(base, '/table-reservations/units', { cookie: creatorCookie }), 200);
  assert.deepEqual(creatorUnits.map((unit) => unit.id), [storeA.id]);

  const payload = {
    unitId: storeA.id, customerName: 'Cliente Reserva', customerEmail: 'CLIENTE@EXAMPLE.COM',
    reservationDate: '2099-11-23', reservationTime: '19:30', peopleCount: 8,
  };
  assert.equal((await request(base, '/table-reservations', { method: 'POST', cookie: viewerCookie, body: payload })).status, 403);
  assert.equal((await request(base, '/table-reservations', {
    method: 'POST', cookie: creatorCookie, body: { ...payload, unitId: storeB.id },
  })).status, 404);
  assert.equal((await request(base, '/table-reservations', {
    method: 'POST', cookie: creatorCookie, body: { ...payload, customerEmail: 'email-invalido' },
  })).status, 400);
  assert.equal((await request(base, '/table-reservations', {
    method: 'POST', cookie: creatorCookie, body: { ...payload, peopleCount: 0 },
  })).status, 400);
  assert.equal((await request(base, '/table-reservations', {
    method: 'POST', cookie: creatorCookie, body: { ...payload, reservationDate: '2020-01-01' },
  })).status, 400);

  const reservation = await expectJson(await request(base, '/table-reservations', {
    method: 'POST', cookie: creatorCookie, body: payload,
  }), 201);
  assert.equal(reservation.status, 'CONFIRMADA');
  assert.equal(reservation.customerEmail, 'cliente@example.com');
  assert.deepEqual(reservation.tables, []);

  const list = await expectJson(await request(base, `/table-reservations?unitId=${storeA.id}&date=2099-11-23`, { cookie: viewerCookie }), 200);
  assert.equal(list.items.length, 1);
  assert.deepEqual(list.summary, { reservations: 1, expectedPeople: 8, checkedInPeople: 0 });
  assert.equal((await request(base, `/table-reservations?unitId=${storeB.id}&date=2099-11-23`, { cookie: storeACookie })).status, 403);
  assert.equal((await request(base, `/table-reservations/${reservation.id}`, { cookie: storeBCookie })).status, 403);
  assert.equal((await request(base, `/table-reservations/${reservation.id}/check-in`, {
    method: 'POST', cookie: viewerCookie, body: { tableIds: [tableA1.id] },
  })).status, 403);
  assert.equal((await request(base, `/table-reservations/${reservation.id}/check-in`, {
    method: 'POST', cookie: storeACookie, body: { tableIds: [] },
  })).status, 400);
  assert.equal((await request(base, `/table-reservations/${reservation.id}/check-in`, {
    method: 'POST', cookie: storeACookie, body: { tableIds: [tableB1.id] },
  })).status, 400);

  const checkedIn = await expectJson(await request(base, `/table-reservations/${reservation.id}/check-in`, {
    method: 'POST', cookie: storeACookie, body: { tableIds: [tableA1.id, tableA2.id] },
  }), 200);
  assert.equal(checkedIn.status, 'COMPARECEU');
  assert.equal(checkedIn.checkedInBy.id, storeUserA.id);
  assert.deepEqual(checkedIn.tables.map((table) => table.id).sort((a, b) => a - b), [tableA1.id, tableA2.id].sort((a, b) => a - b));
  assert.equal((await request(base, `/table-reservations/${reservation.id}/check-in`, {
    method: 'POST', cookie: adminCookie, body: { tableIds: [tableA1.id] },
  })).status, 409);

  const after = await expectJson(await request(base, `/table-reservations?unitId=${storeA.id}&date=2099-11-23`, { cookie: adminCookie }), 200);
  assert.equal(after.summary.checkedInPeople, 8);

  const raceReservation = await expectJson(await request(base, '/table-reservations', {
    method: 'POST', cookie: creatorCookie, body: { ...payload, customerName: 'Cliente Concorrência', reservationTime: '20:30' },
  }), 201);
  const raceResponses = await Promise.all([
    request(base, `/table-reservations/${raceReservation.id}/check-in`, { method: 'POST', cookie: storeACookie, body: { tableIds: [tableA1.id] } }),
    request(base, `/table-reservations/${raceReservation.id}/check-in`, { method: 'POST', cookie: adminCookie, body: { tableIds: [tableA2.id] } }),
  ]);
  assert.deepEqual(raceResponses.map((response) => response.status).sort(), [200, 409]);
  const raceDetail = await expectJson(await request(base, `/table-reservations/${raceReservation.id}`, { cookie: adminCookie }), 200);
  assert.equal(raceDetail.tables.length, 1);

  const adminCreatedTable = await expectJson(await request(base, '/admin/restaurant-tables', {
    method: 'POST', cookie: adminCookie, body: { unitId: storeA.id, name: `Mesa Admin ${suffix}`, capacity: 2, active: true },
  }), 201);
  const adminUpdatedTable = await expectJson(await request(base, `/admin/restaurant-tables/${adminCreatedTable.id}`, {
    method: 'PUT', cookie: adminCookie, body: { unitId: storeA.id, name: adminCreatedTable.name, capacity: 3, active: false },
  }), 200);
  assert.equal(adminUpdatedTable.active, false);
  assert.equal(adminUpdatedTable.capacity, 3);
  const adminTables = await expectJson(await request(base, `/admin/restaurant-tables?unitId=${storeA.id}`, { cookie: adminCookie }), 200);
  assert.ok(adminTables.some((table) => table.id === adminCreatedTable.id));

  const savedSettings = await expectJson(await request(base, '/admin/table-reservation-settings', {
    method: 'PUT', cookie: adminCookie,
    body: { creatorUserIds: [admin.id, storeUserA.id], viewerUserIds: [viewer.id, storeUserB.id], enabledUnitIds: [storeA.id, storeB.id] },
  }), 200);
  assert.deepEqual(savedSettings.creatorUserIds.sort((a, b) => a - b), [admin.id, storeUserA.id].sort((a, b) => a - b));
  assert.deepEqual(savedSettings.viewerUserIds.sort((a, b) => a - b), [viewer.id, storeUserB.id].sort((a, b) => a - b));
  assert.deepEqual(savedSettings.enabledUnitIds.sort((a, b) => a - b), [storeA.id, storeB.id].sort((a, b) => a - b));
});
