const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'reservation-test-secret';

const app = require('../app');
const { normalizeInterval, parseAttributeDefinitions, parseAttributes } = require('../services/reservationService');
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

async function expectStatus(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

test('period normalization uses inclusive Fortaleza dates and attributes reject nested values', () => {
  const interval = normalizeInterval({ startDate: '2099-08-24', endDate: '2099-08-28' }, 'PERIOD');
  assert.equal(interval.startAt.toISOString(), '2099-08-24T03:00:00.000Z');
  assert.equal(interval.endAt.toISOString(), '2099-08-29T03:00:00.000Z');
  assert.equal(parseAttributes({ capacidade: 8, tv: true, modelo: 'A1' }), '{"capacidade":8,"tv":true,"modelo":"A1"}');
  assert.throws(() => parseAttributes({ nested: { invalid: true } }), /texto, número ou booleano/);
  const definitions = parseAttributeDefinitions([
    { key: 'possui_tv', label: 'Possui TV', type: 'BOOLEAN', icon: 'tv' },
    { key: 'capacidade', label: 'Capacidade', type: 'NUMBER', icon: 'capacity' },
  ]);
  assert.equal(parseAttributes({ possui_tv: true, capacidade: '10', ignorado: 'x' }, definitions), '{"possui_tv":true,"capacidade":10}');
  assert.throws(() => parseAttributeDefinitions([
    { key: 'Possui TV', label: 'TV', type: 'BOOLEAN', icon: 'tv' },
  ]), /letras minúsculas/);
});

test('reservation API enforces availability, permissions, history, privacy and concurrent conflicts', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'reserva123';
  const passwordHash = await bcrypt.hash(password, 4);
  const users = await Promise.all([
    prisma.user.create({ data: { name: 'Admin Reserva', email: `reservation-admin-${suffix}@test.local`, passwordHash, role: 'admin' } }),
    prisma.user.create({ data: { name: 'Usuário Reserva A', email: `reservation-a-${suffix}@test.local`, passwordHash, role: 'reader' } }),
    prisma.user.create({ data: { name: 'Usuário Reserva B', email: `reservation-b-${suffix}@test.local`, passwordHash, role: 'creator' } }),
  ]);
  const [admin, userA, userB] = users;
  const server = app.listen(0);

  t.after(async () => {
    server.close();
    await prisma.reservationBlock.deleteMany({ where: { resource: { name: { contains: suffix } } } });
    await prisma.reservation.deleteMany({ where: { resource: { name: { contains: suffix } } } });
    await prisma.reservationResource.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.reservationResourceType.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await request(base, '/reservations/resources')).status, 401);
  const adminCookie = await login(base, admin.email, password);
  const cookieA = await login(base, userA.email, password);
  const cookieB = await login(base, userB.email, password);

  const timeType = await expectStatus(await request(base, '/admin/reservations/resource-types', {
    method: 'POST', cookie: adminCookie,
    body: {
      name: `Sala ${suffix}`, description: 'Salas', reservationMode: 'TIME_SLOT', active: true,
      attributeDefinitions: [
        { key: 'possui_tv', label: 'Possui TV', type: 'BOOLEAN', icon: 'tv' },
        { key: 'capacidade', label: 'Capacidade', type: 'NUMBER', icon: 'capacity' },
      ],
    },
  }), 201);
  const periodType = await expectStatus(await request(base, '/admin/reservations/resource-types', {
    method: 'POST', cookie: adminCookie,
    body: { name: `Notebook ${suffix}`, reservationMode: 'PERIOD', active: true },
  }), 201);

  async function createResource(name, typeId = timeType.id, active = true) {
    return expectStatus(await request(base, '/admin/reservations/resources', {
      method: 'POST', cookie: adminCookie,
      body: { typeId, name: `${name} ${suffix}`, location: 'Matriz', active, attributes: { capacidade: 8, possui_tv: true } },
    }), 201);
  }
  const room1 = await createResource('Sala 01');
  const room2 = await createResource('Sala 02');
  const inactive = await createResource('Sala inativa', timeType.id, false);
  await createResource('Notebook 01', periodType.id);
  assert.deepEqual(room1.attributes, { possui_tv: true, capacidade: 8 });
  assert.equal(room1.type.attributeDefinitions[0].icon, 'tv');

  const slot = { startAt: '2099-08-26T14:00:00-03:00', endAt: '2099-08-26T16:00:00-03:00' };
  const reservation = await expectStatus(await request(base, '/reservations', {
    method: 'POST', cookie: cookieA, body: { resourceId: room1.id, purpose: 'Reunião comercial', ...slot },
  }), 201);
  assert.equal(reservation.status, 'CONFIRMED');

  const calendar = await expectStatus(await request(
    base,
    `/reservations?startAt=2099-08-26T00:00:00-03:00&endAt=2099-08-27T00:00:00-03:00`,
    { cookie: cookieB },
  ), 200);
  const privateEvent = calendar.find((event) => event.id === reservation.id && event.kind === 'RESERVATION');
  assert.ok(privateEvent);
  assert.equal(privateEvent.purpose, undefined);
  assert.equal(privateEvent.user, undefined);

  const fortyTwoDays = await request(
    base,
    '/reservations?startAt=2099-08-01T00:00:00-03:00&endAt=2099-09-12T00:00:00-03:00',
    { cookie: cookieB },
  );
  assert.equal(fortyTwoDays.status, 200, await fortyTwoDays.clone().text());
  const fortyThreeDays = await request(
    base,
    '/reservations?startAt=2099-08-01T00:00:00-03:00&endAt=2099-09-13T00:00:00-03:00',
    { cookie: cookieB },
  );
  assert.equal(fortyThreeDays.status, 400);

  const overlap = await request(base, '/reservations', {
    method: 'POST', cookie: cookieB,
    body: { resourceId: room1.id, purpose: 'Conflito', startAt: '2099-08-26T15:00:00-03:00', endAt: '2099-08-26T17:00:00-03:00' },
  });
  assert.equal(overlap.status, 409);
  assert.equal((await overlap.json()).code, 'RESERVATION_CONFLICT');

  const consecutive = await expectStatus(await request(base, '/reservations', {
    method: 'POST', cookie: cookieB,
    body: { resourceId: room1.id, purpose: 'Consecutiva', startAt: '2099-08-26T16:00:00-03:00', endAt: '2099-08-26T17:00:00-03:00' },
  }), 201);
  assert.equal((await request(base, `/reservations/${reservation.id}/cancel`, { method: 'PATCH', cookie: cookieB, body: {} })).status, 403);
  await expectStatus(await request(base, `/admin/reservations/${reservation.id}/cancel`, { method: 'PATCH', cookie: adminCookie, body: { reason: 'Ajuste administrativo' } }), 200);

  const replacement = await expectStatus(await request(base, '/reservations', {
    method: 'POST', cookie: cookieB, body: { resourceId: room1.id, purpose: 'Horário liberado', ...slot },
  }), 201);
  await expectStatus(await request(base, `/reservations/${replacement.id}/cancel`, { method: 'PATCH', cookie: cookieB, body: { reason: 'Desisti' } }), 200);
  await expectStatus(await request(base, `/reservations/${consecutive.id}/cancel`, { method: 'PATCH', cookie: cookieB, body: {} }), 200);

  assert.equal((await request(base, '/reservations', {
    method: 'POST', cookie: cookieA, body: { resourceId: inactive.id, purpose: 'Não pode', ...slot },
  })).status, 409);
  assert.equal((await request(base, '/reservations', {
    method: 'POST', cookie: cookieA,
    body: { resourceId: room1.id, purpose: 'Inválida', startAt: slot.startAt, endAt: slot.startAt },
  })).status, 400);

  const block = await expectStatus(await request(base, '/admin/reservations/blocks', {
    method: 'POST', cookie: adminCookie, body: { resourceId: room2.id, reason: 'Manutenção', ...slot },
  }), 201);
  assert.equal((await request(base, '/reservations', {
    method: 'POST', cookie: cookieA, body: { resourceId: room2.id, purpose: 'Bloqueada', ...slot },
  })).status, 409);
  assert.equal((await request(base, '/admin/reservations/blocks', {
    method: 'POST', cookie: adminCookie,
    body: { resourceId: room2.id, reason: 'Outro bloqueio', startAt: '2099-08-26T15:00:00-03:00', endAt: '2099-08-26T17:00:00-03:00' },
  })).status, 409);
  await expectStatus(await request(base, `/admin/reservations/blocks/${block.id}/cancel`, {
    method: 'PATCH', cookie: adminCookie, body: { reason: 'Manutenção concluída' },
  }), 200);
  await expectStatus(await request(base, '/reservations', {
    method: 'POST', cookie: cookieA, body: { resourceId: room2.id, purpose: 'Livre novamente', ...slot },
  }), 201);

  const availability = await expectStatus(await request(
    base,
    `/reservations/availability?typeId=${periodType.id}&startDate=2099-08-24&endDate=2099-08-28`,
    { cookie: cookieA },
  ), 200);
  assert.equal(availability.startAt, '2099-08-24T03:00:00.000Z');
  assert.equal(availability.endAt, '2099-08-29T03:00:00.000Z');

  const raceBody = {
    resourceId: room1.id, purpose: 'Corrida',
    startAt: '2099-09-01T10:00:00-03:00', endAt: '2099-09-01T11:00:00-03:00',
  };
  const raceResponses = await Promise.all([
    request(base, '/reservations', { method: 'POST', cookie: cookieA, body: raceBody }),
    request(base, '/reservations', { method: 'POST', cookie: cookieB, body: raceBody }),
  ]);
  assert.deepEqual(raceResponses.map((response) => response.status).sort(), [201, 409]);

  const mine = await expectStatus(await request(base, '/reservations/mine', { cookie: cookieA }), 200);
  assert.ok(mine.some((item) => item.status === 'CANCELLED'));
  assert.ok(mine.some((item) => item.status === 'CONFIRMED'));

  assert.equal((await request(base, '/admin/reservations/resources', {
    method: 'POST', cookie: adminCookie,
    body: { typeId: timeType.id, name: `Inválido ${suffix}`, attributes: { capacidade: -1 } },
  })).status, 400);
});
